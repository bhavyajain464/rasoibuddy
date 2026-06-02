package kafka

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"strconv"
	"strings"
	"time"

	"kitchenai-backend/internal/dblock"
	invgroup "kitchenai-backend/internal/services/inventory"
	"kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/config"

	"github.com/lib/pq"
	kafkago "github.com/segmentio/kafka-go"
)

type itemRow struct {
	ItemID        string
	CanonicalName string
	NeedsExpiry   bool
}

func StartShelfLifeConsumer(db *sql.DB, cfg *config.Config) {
	brokers := strings.Split(cfg.KafkaBrokers, ",")
	topic := cfg.KafkaTopicShelfLife
	if len(brokers) == 0 || strings.TrimSpace(brokers[0]) == "" {
		log.Printf("[kafka-consumer] disabled (empty KAFKA_BROKERS)")
		return
	}

	go func() {
		dialer, err := newDialer(cfg)
		if err != nil {
			log.Printf("[kafka-consumer] disabled: %v", err)
			return
		}

		ensureTopicExists(dialer, brokers, topic, cfg.KafkaTopicPartitions)

		readBackoffMin := time.Duration(cfg.KafkaConsumerReadBackoffMinMs) * time.Millisecond
		readBackoffMax := time.Duration(cfg.KafkaConsumerReadBackoffMaxMs) * time.Millisecond
		errBackoff := time.Duration(cfg.KafkaConsumerErrorBackoffSec) * time.Second

		reader := kafkago.NewReader(kafkago.ReaderConfig{
			Dialer:                dialer,
			Brokers:               brokers,
			Topic:                 topic,
			GroupID:               "shelflife-group",
			MinBytes:              1,
			MaxBytes:              cfg.KafkaConsumerMaxBytes,
			MaxWait:               time.Duration(cfg.KafkaConsumerMaxWaitSec) * time.Second,
			ReadBatchTimeout:      30 * time.Second,
			QueueCapacity:         cfg.KafkaConsumerQueueCapacity,
			CommitInterval:        time.Duration(cfg.KafkaConsumerCommitIntervalSec) * time.Second,
			HeartbeatInterval:     time.Duration(cfg.KafkaConsumerHeartbeatSec) * time.Second,
			SessionTimeout:        time.Duration(cfg.KafkaConsumerSessionTimeoutSec) * time.Second,
			JoinGroupBackoff:      time.Duration(cfg.KafkaConsumerJoinGroupBackoffSec) * time.Second,
			ReadBackoffMin:        readBackoffMin,
			ReadBackoffMax:        readBackoffMax,
			ReadLagInterval:       -1,
			MaxAttempts:           2,
			StartOffset:           kafkago.LastOffset,
			WatchPartitionChanges: false,
			Logger:                kafkago.LoggerFunc(func(msg string, a ...interface{}) {}),
			ErrorLogger:           kafkago.LoggerFunc(log.Printf),
		})

		log.Printf("[kafka-consumer] listening topic=%s group=shelflife-group sasl=%v tls=%v (maxBytes=%d maxWait=%s commitEvery=%s readBackoff=%s-%s)",
			topic, cfg.KafkaSASLEnabled, cfg.KafkaTLSEnabled, cfg.KafkaConsumerMaxBytes,
			time.Duration(cfg.KafkaConsumerMaxWaitSec)*time.Second,
			time.Duration(cfg.KafkaConsumerCommitIntervalSec)*time.Second,
			readBackoffMin, readBackoffMax)
		for {
			msg, err := reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("[kafka-consumer] read error: %v", err)
				time.Sleep(errBackoff)
				continue
			}
			processMessage(db, cfg, msg.Value)
		}
	}()

	log.Printf("[kafka-consumer] starting in background for topic %s", topic)
}

func ensureTopicExists(dialer *kafkago.Dialer, brokers []string, topic string, numPartitions int) {
	if numPartitions < 1 {
		numPartitions = 1
	}

	conn, err := dialer.Dial("tcp", brokers[0])
	if err != nil {
		log.Printf("[kafka-consumer] dial error (topic auto-create may handle it): %v", err)
		return
	}
	defer conn.Close()

	controller, err := conn.Controller()
	if err != nil {
		log.Printf("[kafka-consumer] controller lookup error: %v", err)
		return
	}

	controllerConn, err := dialer.Dial("tcp", controller.Host+":"+strconv.Itoa(controller.Port))
	if err != nil {
		log.Printf("[kafka-consumer] controller dial error: %v", err)
		return
	}
	defer controllerConn.Close()

	err = controllerConn.CreateTopics(kafkago.TopicConfig{
		Topic:             topic,
		NumPartitions:     numPartitions,
		ReplicationFactor: 1,
	})
	if err != nil {
		log.Printf("[kafka-consumer] topic create (may already exist): %v", err)
	} else {
		log.Printf("[kafka-consumer] ensured topic %s exists", topic)
	}
}

func processMessage(db *sql.DB, cfg *config.Config, raw []byte) {
	var event ShelfLifeEvent
	if err := json.Unmarshal(raw, &event); err != nil {
		log.Printf("[kafka-consumer] unmarshal error: %v", err)
		return
	}

	if len(event.ItemIDs) == 0 {
		return
	}

	log.Printf("[kafka-consumer] processing %d item(s) for user %s", len(event.ItemIDs), event.UserID)
	n := EnrichItemsByIDs(db, cfg, event.ItemIDs, event.UserID)
	if n == 0 {
		log.Printf("[kafka-consumer] no items found for enrichment")
	}
}

func dietaryTagsForUser(db *sql.DB, userID string) []string {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil
	}
	prefs, err := services.LoadUserPrefs(db, userID)
	if err != nil || prefs == nil {
		return nil
	}
	return prefs.DietaryTags
}

// EnrichItemsByIDs runs the configured LLM to set food_group for every ID (and
// estimated_expiry only when it is currently NULL). Returns how many rows were processed.
func EnrichItemsByIDs(db *sql.DB, cfg *config.Config, itemIDs []string, userID string) int {
	if len(itemIDs) == 0 {
		return 0
	}
	items := fetchItemsForEnrichment(db, itemIDs)
	if len(items) == 0 {
		return 0
	}

	haveLLMKey := (cfg.LLMProvider == "gemini" && cfg.GeminiAPIKey != "") ||
		(cfg.LLMProvider == "groq" && cfg.HasGroqAPIKey())
	if !haveLLMKey {
		log.Printf("[inventory-enrich] no API key for LLM_PROVIDER=%s, applying defaults", cfg.LLMProvider)
		applyDefaults(db, items)
		return len(items)
	}

	batchSize := cfg.KafkaConsumerGeminiBatchSize
	if batchSize < 1 {
		batchSize = 20
	}
	dietary := dietaryTagsForUser(db, userID)
	pause := time.Duration(cfg.KafkaConsumerPauseBetweenBatchesMs) * time.Millisecond
	for i := 0; i < len(items); i += batchSize {
		end := i + batchSize
		if end > len(items) {
			end = len(items)
		}
		processBatch(db, cfg, items[i:end], dietary)
		if pause > 0 && end < len(items) {
			time.Sleep(pause)
		}
	}
	return len(items)
}

// bulkSetEstimatedExpiry applies all expiry updates in a single round-trip.
func bulkSetEstimatedExpiry(dbConn *sql.DB, ids []string, exps []time.Time) error {
	if len(ids) == 0 {
		return nil
	}
	if len(ids) != len(exps) {
		return errors.New("bulkSetEstimatedExpiry: length mismatch")
	}
	tx, err := dbConn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := dblock.LockInventoryItems(tx, ids); err != nil {
		return err
	}
	_, err = tx.Exec(`
		UPDATE inventory AS inv
		SET estimated_expiry = u.exp, updated_at = NOW()
		FROM (
			SELECT * FROM unnest($1::text[], $2::timestamp with time zone[]) AS u(item_id, exp)
		) AS u
		WHERE inv.item_id = u.item_id::uuid
	`, pq.Array(ids), pq.Array(exps))
	if err != nil {
		return err
	}
	return tx.Commit()
}

func fetchItemsForEnrichment(db *sql.DB, itemIDs []string) []itemRow {
	if len(itemIDs) == 0 {
		return nil
	}
	rows, err := db.Query(
		`SELECT item_id, canonical_name, (estimated_expiry IS NULL) AS needs_expiry
		 FROM inventory WHERE item_id = ANY($1)`,
		pq.Array(itemIDs),
	)
	if err != nil {
		log.Printf("[kafka-consumer] fetch items error: %v", err)
		return nil
	}
	defer rows.Close()

	var items []itemRow
	for rows.Next() {
		var it itemRow
		if err := rows.Scan(&it.ItemID, &it.CanonicalName, &it.NeedsExpiry); err != nil {
			log.Printf("[kafka-consumer] scan item: %v", err)
			continue
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		log.Printf("[kafka-consumer] fetch rows error: %v", err)
	}
	return items
}

func processBatch(db *sql.DB, cfg *config.Config, items []itemRow, dietaryTags []string) {
	names := make([]string, len(items))
	for i, it := range items {
		names[i] = it.CanonicalName
	}

	enriched, err := services.EnrichInventoryItemsForConfig(context.Background(), cfg, names, dietaryTags)
	if err != nil {
		log.Printf("[kafka-consumer] LLM enrich failed, using defaults: %v", err)
		applyDefaults(db, items)
		return
	}

	enrichMap := make(map[string]services.InventoryEnrichment)
	for _, e := range enriched {
		enrichMap[strings.ToLower(strings.TrimSpace(e.Name))] = e
	}

	now := time.Now()
	allIDs := make([]string, len(items))
	allGroups := make([]string, len(items))
	var expiryIDs []string
	var exps []time.Time

	for i, it := range items {
		key := strings.ToLower(strings.TrimSpace(it.CanonicalName))
		e, ok := enrichMap[key]
		group := "other"
		days := DefaultShelfLife(it.CanonicalName)
		if ok {
			group = invgroup.NormalizeFoodGroupForDietary(e.FoodGroup, dietaryTags)
			if e.ShelfLifeDays > 0 {
				days = e.ShelfLifeDays
			}
		}
		allIDs[i] = it.ItemID
		allGroups[i] = group
		if it.NeedsExpiry {
			expiryIDs = append(expiryIDs, it.ItemID)
			exps = append(exps, now.AddDate(0, 0, days))
		}
	}

	if err := bulkSetFoodGroups(db, allIDs, allGroups); err != nil {
		log.Printf("[kafka-consumer] bulk food_group error: %v", err)
	}
	if len(expiryIDs) > 0 {
		if err := bulkSetEstimatedExpiry(db, expiryIDs, exps); err != nil {
			log.Printf("[kafka-consumer] bulk expiry error: %v", err)
			return
		}
		log.Printf("[kafka-consumer] enriched %d item(s) (%d expiry set)", len(allIDs), len(expiryIDs))
	} else {
		log.Printf("[kafka-consumer] enriched food_group for %d item(s)", len(allIDs))
	}
}

func applyDefaults(db *sql.DB, items []itemRow) {
	now := time.Now()
	allIDs := make([]string, len(items))
	allGroups := make([]string, len(items))
	var expiryIDs []string
	var exps []time.Time

	for i, it := range items {
		allIDs[i] = it.ItemID
		allGroups[i] = "other"
		if it.NeedsExpiry {
			expiryIDs = append(expiryIDs, it.ItemID)
			exps = append(exps, now.AddDate(0, 0, DefaultShelfLife(it.CanonicalName)))
		}
	}
	_ = bulkSetFoodGroups(db, allIDs, allGroups)
	if len(expiryIDs) > 0 {
		_ = bulkSetEstimatedExpiry(db, expiryIDs, exps)
	}
	log.Printf("[kafka-consumer] applied defaults to %d item(s)", len(items))
}

func bulkSetFoodGroups(dbConn *sql.DB, ids []string, groups []string) error {
	if len(ids) == 0 {
		return nil
	}
	if len(ids) != len(groups) {
		return errors.New("bulkSetFoodGroups: length mismatch")
	}
	tx, err := dbConn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := dblock.LockInventoryItems(tx, ids); err != nil {
		return err
	}
	_, err = tx.Exec(`
		UPDATE inventory AS inv
		SET food_group = u.grp, updated_at = NOW()
		FROM (
			SELECT * FROM unnest($1::text[], $2::text[]) AS u(item_id, grp)
		) AS u
		WHERE inv.item_id = u.item_id::uuid
	`, pq.Array(ids), pq.Array(groups))
	if err != nil {
		return err
	}
	return tx.Commit()
}

func DefaultShelfLife(name string) int {
	lower := strings.ToLower(name)

	longLife := []string{"rice", "dal", "lentil", "flour", "atta", "maida", "besan", "rava", "sooji", "poha", "sugar", "salt", "jaggery"}
	for _, kw := range longLife {
		if strings.Contains(lower, kw) {
			return 90
		}
	}

	spices := []string{"turmeric", "haldi", "cumin", "jeera", "coriander", "chili", "mirch", "garam masala", "mustard seed", "pepper", "clove", "cardamom", "cinnamon", "bay leaf"}
	for _, kw := range spices {
		if strings.Contains(lower, kw) {
			return 180
		}
	}

	oils := []string{"oil", "ghee", "butter"}
	for _, kw := range oils {
		if strings.Contains(lower, kw) {
			return 90
		}
	}

	dairy := []string{"milk", "curd", "yogurt", "paneer", "cheese"}
	for _, kw := range dairy {
		if strings.Contains(lower, kw) {
			return 5
		}
	}

	vegs := []string{"tomato", "potato", "onion", "garlic", "ginger"}
	for _, kw := range vegs {
		if strings.Contains(lower, kw) {
			return 10
		}
	}

	if strings.Contains(lower, "bread") || strings.Contains(lower, "pav") {
		return 4
	}
	if strings.Contains(lower, "egg") {
		return 14
	}
	if strings.Contains(lower, "tea") || strings.Contains(lower, "coffee") {
		return 180
	}

	return 30
}

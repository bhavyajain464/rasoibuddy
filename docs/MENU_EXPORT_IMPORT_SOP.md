# Menu export & import — restaurant SOP

Use this guide to download your menu as a spreadsheet, update dish ingredients in Excel or Google Sheets, and upload the file back into KitchenAI.

**Who can use this:** Managers and owners only.

**Where it works:** Web browser (laptop or desktop). File download and upload are not available on the mobile app yet.

---

## What this feature does

- **Export** — downloads your full menu as a `.csv` file (opens in Excel or Google Sheets).
- **Import** — reads that file and updates your menu in KitchenAI.

Each dish is **one row**. You mainly edit the **Ingredients** column — that is what KitchenAI uses for stock and recipe planning.

---

## Step 1 — Export your menu

1. Log in to KitchenAI on the **web** (browser).
2. Open the **Menu** page.
3. Tap the **+** button (top right).
4. Choose **Export menu to file**.
5. A file named `menu-….csv` will download to your computer.

You should see a success message with how many dishes were exported.

---

## Step 2 — Open the file in Excel or Google Sheets

Double-click the downloaded file, or:

- **Excel:** File → Open → select the `.csv` file.
- **Google Sheets:** File → Import → Upload → select the file.

### Columns in the file

| Column | What it means | Example |
|--------|----------------|---------|
| **Dish Name** | Name of the dish | Dal Fry |
| **Category** | Menu section | Main Course |
| **Price (INR)** | Selling price in rupees | 180 |
| **Active** | Is the dish on the menu? | Yes or No |
| **Ingredients** | Recipe ingredients for this dish | toor dal 80 g, onion 50 g |

**Do not add or remove columns.** Keep the header row (first row) as it is.

---

## Step 3 — Edit ingredients

Focus on the **Ingredients** column. Each dish has **one cell** with all ingredients listed together, separated by commas.

### How to write ingredients

| Format | Example |
|--------|---------|
| Name + quantity + unit | `toor dal 80 g, onion 50 g, turmeric 5 g` |
| Name only (quantity filled automatically if known) | `paneer, cream, butter` |
| Quantity in brackets | `ginger (10 g), garlic (5 g)` |
| Quantity attached to unit | `tomato 100g, oil 20ml` |

**Tips:**

- Separate each ingredient with a **comma**.
- Use simple units: `g`, `kg`, `ml`, `l`, `pcs`.
- One row = one dish. Do not split a dish across multiple rows.
- To remove all ingredients for a dish, leave the Ingredients cell **empty**.
- To add a **new dish**, add a new row with Dish Name, Category, Price, Active, and Ingredients filled in.
- To **hide** a dish from the menu, set **Active** to `No` (do not delete the row unless you want to re-add it later via import as a new dish).

You can also update **Price (INR)** and **Category** if needed. KitchenAI matches dishes by **Dish Name** when you import.

---

## Step 4 — Save the file

- **Excel:** File → Save (keep format as **CSV** if asked).
- **Google Sheets:** File → Download → **Comma-separated values (.csv)**.

Use the saved `.csv` file for import. Do not rename columns or change the file to `.xlsx` unless you export/download as CSV again before importing.

---

## Step 5 — Import the file back

1. Go to **Menu** in KitchenAI (web).
2. Tap the **+** button.
3. Choose **Import menu from file**.
4. Select the `.csv` file you saved.
5. Wait for the upload to finish.

You will see a summary, for example:

> Import done — 3 added, 45 updated

- **Added** — new dishes that were not in your menu before.
- **Updated** — existing dishes whose details or ingredients were changed.
- **Warnings** — some rows had issues (e.g. invalid price); other rows still import.

Refresh or scroll the menu to confirm your changes.

---

## Quick reference

| Task | Action |
|------|--------|
| Download menu | Menu → **+** → **Export menu to file** |
| Upload menu | Menu → **+** → **Import menu from file** |
| Update ingredients | Edit **Ingredients** column only |
| Add a new dish | New row + fill all columns |
| Stop selling a dish | Set **Active** to `No` |
| Change price | Edit **Price (INR)** |

---

## Example row

```text
Dish Name,Category,Price (INR),Active,Ingredients
Dal Fry,Main Course,180,Yes,"toor dal 80 g, onion 50 g, tomato 50 g, ginger 10 g"
```

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| Export/Import option missing | You need **Manager** or **Owner** access. Ask your admin. |
| “File download is only supported on web” | Use a browser on laptop/desktop, not the phone app. |
| Import says invalid CSV | Keep the header row; save as `.csv`; do not delete required columns. |
| Dish did not update | Check **Dish Name** spelling matches exactly (import matches by name). |
| Ingredients look wrong after import | Use commas between ingredients; include quantity and unit where possible. |
| Excel shows garbled text | Re-export from KitchenAI and open again — the file uses UTF-8 for Indian language names. |

---

## Good practice

1. **Export before big edits** — keep a backup copy with the date in the filename (e.g. `menu-backup-2026-06-07.csv`).
2. **Edit ingredients in batches** — update one category at a time, import, and check the menu.
3. **Do not share the file publicly** — it contains your menu and pricing.

For technical support, contact your KitchenAI account manager or support team.

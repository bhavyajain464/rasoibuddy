import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PublicStackParamList } from '../navigation/types';

if (Platform.OS === 'web') {
  require('../styles/landing.web.css');
}

type BillingMode = 'monthly' | 'yearly';

type Plan = {
  id: string;
  name: string;
  why: string;
  monthly: number;
  yearly: number;
  yearlyTotal?: number;
  popular?: boolean;
  cta: string;
  variant: 'primary' | 'ghost';
  features: string[];
};

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    why: 'For getting started',
    monthly: 0,
    yearly: 0,
    cta: 'Get started',
    variant: 'ghost',
    features: [
      '2 bill scans / day',
      'Daily & meal-of-the-day ideas',
      'Pantry & expiry tracking',
      'Shopping list + order online',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    why: 'For everyday home cooks',
    monthly: 99,
    yearly: 83,
    yearlyTotal: 990,
    popular: true,
    cta: 'Go Pro',
    variant: 'primary',
    features: [
      'Unlimited bill scans',
      'All meal categories — healthy, tasty, rescue, meal-prep',
      '7-day meal planning',
      'WhatsApp cook coordination',
    ],
  },
  {
    id: 'elite',
    name: 'Elite',
    why: 'For the health-focused',
    monthly: 199,
    yearly: 166,
    yearlyTotal: 1990,
    cta: 'Go Elite',
    variant: 'ghost',
    features: [
      'Everything in Pro',
      'Nightly diet analysis & reports',
      'Shared family kitchen',
      'Priority support',
    ],
  },
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function BrandLogo({ size = 20 }: { size?: number }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M12 3c4 0 7 3 7 7 0 5-5 9-7 11-2-2-7-6-7-11 0-4 3-7 7-7Z" fill="#fff" opacity=".95" />
        <path
          d="M12 7v8M12 10c-1.4-1.1-2.8-1.1-3.7 0M12 12c1.4-1.1 2.8-1.1 3.7 0"
          stroke="#15803D"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function scrollTo(id: string) {
  if (Platform.OS !== 'web') return;
  const target = document.getElementById(id);
  const scroller = document.querySelector('.landing-page');
  if (!target || !scroller) return;
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  scroller.scrollTo({ top, behavior: 'smooth' });
}

function planPrice(plan: Plan, mode: BillingMode) {
  if (plan.monthly === 0) {
    return { amount: '0', period: ' /forever', billed: '' };
  }
  if (mode === 'yearly') {
    return {
      amount: String(plan.yearly),
      period: ' /mo',
      billed: `billed ₹${Number(plan.yearlyTotal).toLocaleString('en-IN')}/year`,
    };
  }
  return { amount: String(plan.monthly), period: ' /month', billed: '' };
}

function LandingPageWeb() {
  const navigation = useNavigation<NativeStackNavigationProp<PublicStackParamList>>();
  const [billing, setBilling] = useState<BillingMode>('monthly');
  const [carouselIndex, setCarouselIndex] = useState(1);
  const trackRef = useRef<HTMLDivElement>(null);

  const goLogin = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);

  const openPrivacy = useCallback(() => {
    if (Platform.OS === 'web') window.location.href = '/privacy';
    else void Linking.openURL('/privacy');
  }, []);

  const syncCarousel = useCallback(() => {
    const track = trackRef.current;
    if (!track || !track.children.length) return;
    const step = (track.children[0] as HTMLElement).offsetWidth + 16;
    const index = Math.max(0, Math.min(PLANS.length - 1, Math.round(track.scrollLeft / step)));
    setCarouselIndex(index);
  }, []);

  const scrollToPlan = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track || !track.children.length) return;
    const step = (track.children[0] as HTMLElement).offsetWidth + 16;
    track.scrollTo({ left: index * step, behavior: 'smooth' });
    setCarouselIndex(index);
  }, []);

  useEffect(() => {
    document.title = 'Kitchmate — The AI Kitchen OS for Indian homes';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        'content',
        'Kitchmate scans your grocery bills, suggests meals from what you already have, plans your week, and coordinates with your cook — so you waste less and never wonder what to cook again.',
      );
    }
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => window.requestAnimationFrame(syncCarousel);
    track.addEventListener('scroll', onScroll);
    if (window.matchMedia('(max-width:860px)').matches) {
      requestAnimationFrame(() => scrollToPlan(1));
    }
    return () => track.removeEventListener('scroll', onScroll);
  }, [scrollToPlan, syncCarousel]);

  return (
    <div className="landing-page">
      <header>
        <div className="wrap nav">
          <div className="brand">
            <BrandLogo />
            Kitchmate
          </div>
          <nav className="nav-links">
            <button type="button" onClick={() => scrollTo('features')}>
              Features
            </button>
            <button type="button" onClick={() => scrollTo('how')}>
              How it works
            </button>
            <button type="button" onClick={() => scrollTo('pricing')}>
              Pricing
            </button>
            <button type="button" className="btn btn-primary" style={{ padding: '9px 18px' }} onClick={goLogin}>
              Get the app
            </button>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow">
              <span className="dot" /> The AI Kitchen OS
            </span>
            <h1 className="display">
              Never wonder
              <br />
              <span className="hl">&ldquo;what to cook?&rdquo;</span> again.
            </h1>
            <p>
              Kitchmate scans your grocery bills, suggests meals from what&apos;s already in your kitchen, plans your
              week, and even messages your cook — so you waste less and eat better.
            </p>
            <div className="cta-row">
              <button type="button" className="btn btn-primary" onClick={goLogin}>
                Get started free
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => scrollTo('how')}>
                See how it works
              </button>
            </div>
            <div className="mini">
              <span>
                <svg className="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>{' '}
                <b>500+</b> home dishes
              </span>
              <span>
                <svg className="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>{' '}
                Bill scan → pantry
              </span>
              <span>
                <svg className="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>{' '}
                Less food waste
              </span>
            </div>
          </div>

          <div className="phone-wrap">
            <div className="glow" />
            <div className="phone">
              <div className="screen">
                <div className="s-top">
                  <div className="s-hi">Good evening</div>
                  <div className="s-q">Tonight&apos;s dinner</div>
                </div>
                <div className="s-card">
                  <div className="s-tag">Meal of the day</div>
                  <div className="s-dish">Palak Paneer</div>
                  <div className="s-meta">25 min · uses 6 items from your pantry</div>
                  <div className="s-pills">
                    <span className="s-pill">High protein</span>
                    <span className="s-pill">Medium spice</span>
                    <span className="s-pill">North Indian</span>
                  </div>
                </div>
                <div className="s-list">
                  <div className="s-row">
                    <div className="s-dot">
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8">
                        <circle cx="12" cy="13" r="7" />
                        <path d="M12 6c0-2 1-3 3-3" />
                      </svg>
                    </div>
                    <div className="s-rt">
                      <div className="s-rn">Tomatoes</div>
                    </div>
                    <div className="s-rs warn">2 days left</div>
                  </div>
                  <div className="s-row">
                    <div className="s-dot">
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8">
                        <path d="M12 20c-5-2-8-7-6-13 5-1 9 2 9 7" />
                        <path d="M12 20c5-2 7-6 6-11" />
                      </svg>
                    </div>
                    <div className="s-rt">
                      <div className="s-rn">Spinach</div>
                    </div>
                    <div className="s-rs warn">Use today</div>
                  </div>
                  <div className="s-row">
                    <div className="s-dot">
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8">
                        <rect x="4" y="7" width="16" height="11" rx="2" />
                        <path d="M8 7V5h8v2" />
                      </svg>
                    </div>
                    <div className="s-rt">
                      <div className="s-rn">Paneer</div>
                    </div>
                    <div className="s-rs ok">Fresh</div>
                  </div>
                </div>
                <div className="s-tab">
                  <i className="on" />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="wrap">
          <div className="stats">
            <div className="stat">
              <b>500+</b>
              <span>home-style dishes</span>
            </div>
            <div className="stat">
              <b>770+</b>
              <span>ingredients mapped</span>
            </div>
            <div className="stat">
              <b>3 taps</b>
              <span>bill → inventory</span>
            </div>
            <div className="stat">
              <b>~30%</b>
              <span>less food wasted*</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="head">
            <span className="eyebrow">Sound familiar?</span>
            <h2>Running a kitchen is a full-time job nobody applied for.</h2>
          </div>
          <div className="prob-grid">
            <div className="prob">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                  <circle cx="12" cy="12" r="9.5" />
                </svg>
              </div>
              <h3>&ldquo;What to cook today?&rdquo;</h3>
              <p>A full fridge and still no idea what to make. Decision fatigue, every single day.</p>
            </div>
            <div className="prob">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                </svg>
              </div>
              <h3>Groceries that rot</h3>
              <p>Veggies forgotten at the back, expiry dates missed, panic-bought duplicates thrown away.</p>
            </div>
            <div className="prob">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5Z" />
                </svg>
              </div>
              <h3>Coordinating the cook</h3>
              <p>Explaining the menu, the recipe, what&apos;s in stock — over and over, in scattered messages.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features">
        <div className="wrap">
          <div className="head">
            <span className="eyebrow">Everything in one app</span>
            <h2>Everything your kitchen needs, in your pocket.</h2>
            <p className="sub">From the bill to the table — Kitchmate handles inventory, ideas, planning, and shopping.</p>
          </div>
          <div className="feat-grid">
            <div className="feat">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                  <circle cx="12" cy="12" r="3.2" />
                </svg>
              </div>
              <h3>Scan your bill</h3>
              <p>Snap a grocery bill and Kitchmate auto-fills your pantry with items, quantities, and estimated expiry.</p>
            </div>
            <div className="feat">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 13a8 8 0 0 1 16 0Z" />
                  <path d="M2 13h20M12 5V3M7 13a5 5 0 0 1 10 0" />
                </svg>
              </div>
              <h3>Smart meal ideas</h3>
              <p>Daily, healthy, tasty, rescue &amp; meal-of-the-day picks — ranked by what you have, your taste, spice level, and diet.</p>
            </div>
            <div className="feat">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17a5 5 0 0 1-1-9.8A6 6 0 0 1 18 8a4 4 0 0 1 0 8" />
                  <path d="M12 12v6m0 0 2.5-2.5M12 18l-2.5-2.5" />
                </svg>
              </div>
              <h3>Rescue expiring food</h3>
              <p>Get meals that use what&apos;s about to go bad first, so less ends up in the bin.</p>
            </div>
            <div className="feat">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
                  <path d="M3 9h18M8 3v3M16 3v3M8 13h2M14 13h2M8 17h2" />
                </svg>
              </div>
              <h3>Plan your week</h3>
              <p>A rotating 7-day plan with no repeats — and one shopping list for everything you&apos;re missing.</p>
            </div>
            <div className="feat">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="20" r="1.4" />
                  <circle cx="18" cy="20" r="1.4" />
                  <path d="M2 3h3l2.2 12.5a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
                </svg>
              </div>
              <h3>Order in a tap</h3>
              <p>Turn your shopping list into an order on Blinkit, Zepto, BigBasket &amp; more — one item at a time, instantly.</p>
            </div>
            <div className="feat">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5Z" />
                </svg>
              </div>
              <h3>Talk to your cook</h3>
              <p>Send today&apos;s menu and recipes to your cook on WhatsApp, in their language — one tap, done.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="how" id="how">
        <div className="wrap">
          <div className="head" style={{ marginBottom: 0 }}>
            <span className="eyebrow">How it works</span>
            <h2>Set up in minutes. Save time every day.</h2>
            <p className="sub">No spreadsheets, no manual entry — just point your camera and cook.</p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="n">1</div>
              <h3>Scan &amp; stock</h3>
              <p>Photograph your grocery bill. Your pantry fills itself with items and expiry dates.</p>
            </div>
            <div className="step">
              <div className="n">2</div>
              <h3>Get your meals</h3>
              <p>Open the app to fresh, personalized meal ideas built around what you already own.</p>
            </div>
            <div className="step">
              <div className="n">3</div>
              <h3>Cook or delegate</h3>
              <p>Cook it yourself, or send the menu to your cook on WhatsApp — and reorder what&apos;s running low.</p>
            </div>
          </div>
        </div>
      </div>

      <section id="pricing">
        <div className="wrap">
          <div className="head" style={{ marginBottom: 34 }}>
            <span className="eyebrow">Simple pricing</span>
            <h2>Start free. Upgrade when it saves you time.</h2>
            <div className="billing">
              <button
                type="button"
                className={`bt${billing === 'monthly' ? ' active' : ''}`}
                onClick={() => setBilling('monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`bt${billing === 'yearly' ? ' active' : ''}`}
                onClick={() => setBilling('yearly')}
              >
                Yearly <em>save 17%</em>
              </button>
            </div>
          </div>

          <div className="carousel">
            <div className="price-track" ref={trackRef}>
              {PLANS.map((plan) => {
                const price = planPrice(plan, billing);
                return (
                  <div className={`plan${plan.popular ? ' pop' : ''}`} key={plan.id}>
                    {plan.popular ? <span className="badge">Most popular</span> : null}
                    <h3>{plan.name}</h3>
                    <div className="why">{plan.why}</div>
                    <div className="amt">
                      ₹<span className="num">{price.amount}</span>
                      <small className="per">{price.period}</small>
                    </div>
                    <div className="billed">{price.billed}</div>
                    <ul>
                      {plan.features.map((feature) => (
                        <li key={feature}>
                          <CheckIcon />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`btn btn-${plan.variant}`}
                      onClick={goLogin}
                    >
                      {plan.cta}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cnav">
            <button
              type="button"
              className="arrow prev"
              aria-label="Previous plan"
              disabled={carouselIndex === 0}
              onClick={() => scrollToPlan(Math.max(0, carouselIndex - 1))}
            >
              ‹
            </button>
            <div className="dots">
              {PLANS.map((plan, index) => (
                <i
                  key={plan.id}
                  className={index === carouselIndex ? 'on' : undefined}
                  onClick={() => scrollToPlan(index)}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${plan.name} plan`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') scrollToPlan(index);
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="arrow next"
              aria-label="Next plan"
              disabled={carouselIndex === PLANS.length - 1}
              onClick={() => scrollToPlan(Math.min(PLANS.length - 1, carouselIndex + 1))}
            >
              ›
            </button>
          </div>
        </div>
      </section>

      <section id="get">
        <div className="wrap final">
          <div className="final-card">
            <h2>Your kitchen, intelligently run.</h2>
            <p>Join the households turning grocery chaos into easy, waste-free home cooking.</p>
            <button type="button" className="btn btn-primary" onClick={goLogin}>
              Get started with Kitchmate
            </button>
            <small>Available on Android, iOS &amp; web</small>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot">
          <div className="brand" style={{ fontSize: 17 }}>
            <BrandLogo size={16} /> Kitchmate
          </div>
          <div>© {new Date().getFullYear()} Kitchmate · Made for Indian kitchens</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <button type="button" onClick={openPrivacy}>
              Privacy
            </button>
            <button type="button" onClick={() => scrollTo('features')}>
              Features
            </button>
            <button type="button" onClick={() => scrollTo('pricing')}>
              Pricing
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LandingPageNative() {
  const navigation = useNavigation<NativeStackNavigationProp<PublicStackParamList>>();

  return (
    <ScrollView contentContainerStyle={nativeStyles.container}>
      <Text style={nativeStyles.title}>Kitchmate</Text>
      <Text style={nativeStyles.subtitle}>The AI Kitchen OS for Indian homes</Text>
      <Pressable style={nativeStyles.button} onPress={() => navigation.navigate('Login')}>
        <Text style={nativeStyles.buttonText}>Get started</Text>
      </Pressable>
    </ScrollView>
  );
}

export function LandingScreen() {
  if (Platform.OS === 'web') {
    return <LandingPageWeb />;
  }
  return <LandingPageNative />;
}

const nativeStyles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FBFCFB',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0C1611',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#5B6B61',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 13,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});

import type { Product } from '../types.js';

/**
 * Sample merchant catalog for the demo merchant: "Volt & Co." — a fictional
 * electronics & workspace lifestyle store.
 *
 * Every product is written to be *agent-readable*: structured attributes, tags,
 * and an `agentBlurb` written for LLM consumers (not humans). This is the core
 * idea of the "agent-readable catalog" half of Track 01.
 */
export const MERCHANT = {
  name: 'Volt & Co.',
  tagline: 'Gear that powers your desk and your day.',
  domain: 'https://volt-and-co.example',
  currency: 'INR',
  policies: {
    freeShippingAbovePaise: 99900, // free shipping above ₹999
    shippingFlatPaise: 49900, // else flat ₹499
    returnDays: 14,
    etaDays: 3,
    paymentMethods: ['UPI', 'cards', 'netbanking', 'wallet'],
  },
} as const;

export const PRODUCTS: Product[] = [
  {
    id: 'kbd-mech-75',
    name: 'Volt Mechanical Keyboard 75%',
    brand: 'Volt',
    category: 'Keyboards',
    description:
      'A 75% hot-swappable mechanical keyboard with gasket mount, RGB backlight and 2.4GHz + Bluetooth 5.1. Ideal for developers and writers.',
    pricePaise: 449900,
    currency: 'INR',
    stock: 42,
    tags: ['keyboard', 'mechanical', 'wireless', 'hot-swap', 'rgb', '75%', 'developer', 'gift'],
    attributes: [
      { key: 'layout', label: 'Layout', value: '75%' },
      { key: 'switch', label: 'Switch type', value: 'Hot-swappable' },
      { key: 'connectivity', label: 'Connectivity', value: '2.4GHz / Bluetooth 5.1 / USB-C' },
      { key: 'backlight', label: 'Backlight', value: 'RGB' },
      { key: 'battery', label: 'Battery', value: '4000 mAh' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      'Best-in-line 75% mechanical keyboard. Great gift for developers. Hot-swappable, tri-mode wireless, RGB. Ships in 3 days, free shipping above ₹999, 14-day returns.',
  },
  {
    id: 'kbd-switch-set',
    name: 'Volt Silent Switch Set (35 pcs)',
    brand: 'Volt',
    category: 'Keyboards',
    description:
      'A 35-piece set of silent linear switches to customise your mechanical keyboard. Pre-lubed, smooth and quiet.',
    pricePaise: 129900,
    currency: 'INR',
    stock: 87,
    tags: ['keyboard', 'switches', 'mechanical', 'custom', 'accessory'],
    attributes: [
      { key: 'count', label: 'Count', value: '35' },
      { key: 'type', label: 'Switch type', value: 'Linear, pre-lubed' },
      { key: 'compatibility', label: 'Compatibility', value: '3-pin & 5-pin hot-swap' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      'Upgrade companion to the Volt 75% keyboard: 35 silent pre-lubed linear switches. Pairs with any hot-swappable board.',
  },
  {
    id: 'mouse-ergo-wireless',
    name: 'Volt Ergo Wireless Mouse',
    brand: 'Volt',
    category: 'Peripherals',
    description:
      'An ergonomic vertical wireless mouse with silent clicks, 1600 DPI sensor and 3-month battery. Comfort for long workdays.',
    pricePaise: 149900,
    currency: 'INR',
    stock: 120,
    tags: ['mouse', 'wireless', 'ergonomic', 'vertical', 'silent', 'desk'],
    attributes: [
      { key: 'dpi', label: 'DPI', value: '800–1600' },
      { key: 'connectivity', label: 'Connectivity', value: '2.4GHz / Bluetooth' },
      { key: 'battery', label: 'Battery', value: '3 months' },
      { key: 'clicks', label: 'Clicks', value: 'Silent' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      'Ergonomic vertical wireless mouse with silent clicks — the reliable default for desk workers. Budget-friendly at ₹1,499.',
  },
  {
    id: 'hub-usbc-7in1',
    name: 'Volt USB-C Hub 7-in-1',
    brand: 'Volt',
    category: 'Peripherals',
    description:
      '7-in-1 USB-C hub: HDMI 4K, 2× USB-A 3.0, SD/TF reader, 100W PD pass-through. Fits any modern laptop.',
    pricePaise: 249900,
    currency: 'INR',
    stock: 63,
    tags: ['hub', 'usb-c', 'adapter', 'hdmi', 'sd-card', 'laptop'],
    attributes: [
      { key: 'ports', label: 'Ports', value: 'HDMI 4K, 2×USB-A 3.0, SD, TF, USB-C PD 100W' },
      { key: 'video', label: 'Video out', value: '4K @ 60Hz' },
      { key: 'power', label: 'Power delivery', value: '100W' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      '7-in-1 USB-C hub with 4K HDMI and 100W PD — essential travel companion for MacBook/Windows laptops.',
  },
  {
    id: 'mon-27-qhd',
    name: 'Volt 27" QHD Monitor',
    brand: 'Volt',
    category: 'Displays',
    description:
      '27-inch QHD IPS monitor with 100Hz refresh, 95% sRGB, and USB-C with 65W power delivery. Great for productivity.',
    pricePaise: 2199900,
    currency: 'INR',
    stock: 18,
    tags: ['monitor', 'display', 'qhd', 'ips', 'usb-c', 'work-from-home'],
    attributes: [
      { key: 'size', label: 'Screen size', value: '27"' },
      { key: 'panel', label: 'Panel', value: 'IPS, QHD 2560×1440' },
      { key: 'refresh', label: 'Refresh rate', value: '100Hz' },
      { key: 'color', label: 'Colour gamut', value: '95% sRGB' },
      { key: 'usbc', label: 'USB-C', value: '65W power delivery' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 5 },
    agentBlurb:
      '27" QHD IPS monitor with USB-C 65W — a strong single-cable setup for developers. Premium pick, ships in 5 days.',
  },
  {
    id: 'webcam-1080p',
    name: 'Volt 1080p Webcam Pro',
    brand: 'Volt',
    category: 'Peripherals',
    description:
      '1080p webcam with autofocus, dual noise-reducing mics and a privacy shutter. Crisp video for calls and interviews.',
    pricePaise: 399900,
    currency: 'INR',
    stock: 51,
    tags: ['webcam', '1080p', 'video-call', 'streaming', 'privacy-shutter'],
    attributes: [
      { key: 'resolution', label: 'Resolution', value: '1080p / 30fps' },
      { key: 'focus', label: 'Focus', value: 'Autofocus' },
      { key: 'microphone', label: 'Mic', value: 'Dual noise-reducing' },
      { key: 'privacy', label: 'Privacy', value: 'Shutter' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      '1080p autofocus webcam with privacy shutter and noise-cancelling mics — ideal for WFH, calls and streaming.',
  },
  {
    id: 'audio-nc-headphones',
    name: 'Volt Noise-Cancelling Headphones',
    brand: 'Volt',
    category: 'Audio',
    description:
      'Over-ear headphones with adaptive active noise cancellation, 40h battery and multipoint Bluetooth. Deep focus, all day.',
    pricePaise: 849900,
    currency: 'INR',
    stock: 29,
    tags: ['headphones', 'noise-cancelling', 'wireless', 'audio', 'focus', 'travel'],
    attributes: [
      { key: 'type', label: 'Type', value: 'Over-ear, wireless' },
      { key: 'anc', label: 'ANC', value: 'Adaptive active noise cancellation' },
      { key: 'battery', label: 'Battery', value: '40 hours' },
      { key: 'bluetooth', label: 'Bluetooth', value: 'Multipoint 5.3' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      'Over-ear ANC headphones, 40h battery, multipoint — the "focus mode" favourite for deep work and travel.',
  },
  {
    id: 'audio-bt-speaker',
    name: 'Volt Pocket Bluetooth Speaker',
    brand: 'Volt',
    category: 'Audio',
    description:
      'A palm-sized IPX6 Bluetooth speaker with 12h playtime and punchy bass. Great for dorms and desks.',
    pricePaise: 199900,
    currency: 'INR',
    stock: 140,
    tags: ['speaker', 'bluetooth', 'portable', 'waterproof', 'music'],
    attributes: [
      { key: 'ip', label: 'Water resistance', value: 'IPX6' },
      { key: 'battery', label: 'Battery', value: '12 hours' },
      { key: 'bluetooth', label: 'Bluetooth', value: '5.3' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      'Pocket IPX6 Bluetooth speaker with 12h battery — the budget audio pick for students and dorms.',
  },
  {
    id: 'access-deskmat',
    name: 'Volt Extended Desk Mat (900×400mm)',
    brand: 'Volt',
    category: 'Accessories',
    description:
      'A stitched-edge extended desk mat with a smooth microfiber surface and anti-slip rubber base. Protects your desk and your wrist.',
    pricePaise: 79900,
    currency: 'INR',
    stock: 200,
    tags: ['desk-mat', 'mouse-pad', 'workspace', 'setup', 'accessory'],
    attributes: [
      { key: 'size', label: 'Size', value: '900 × 400 mm' },
      { key: 'surface', label: 'Surface', value: 'Microfiber, stitched edge' },
      { key: 'base', label: 'Base', value: 'Anti-slip rubber' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      'Extended desk mat, 900×400mm, stitched edges. Cheap add-on that makes any setup look intentional.',
  },
  {
    id: 'access-laptop-stand',
    name: 'Volt Aluminium Laptop Stand',
    brand: 'Volt',
    category: 'Accessories',
    description:
      'A foldable aluminium laptop stand with six height levels, improved airflow and a stable base. Ergonomic posture on any desk.',
    pricePaise: 179900,
    currency: 'INR',
    stock: 76,
    tags: ['laptop-stand', 'ergonomic', 'aluminium', 'desk', 'posture'],
    attributes: [
      { key: 'material', label: 'Material', value: 'Aluminium' },
      { key: 'heights', label: 'Height levels', value: '6' },
      { key: 'fits', label: 'Fits', value: '11"–17" laptops' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      'Foldable aluminium laptop stand with 6 height levels — ergonomic posture upgrade for long workdays.',
  },
  {
    id: 'storage-ssd-1tb',
    name: 'Volt Portable SSD 1TB',
    brand: 'Volt',
    category: 'Storage',
    description:
      'A pocket-sized 1TB portable SSD with 1050MB/s reads, USB 3.2 Gen 2 and drop resistance. Fast, reliable backups on the go.',
    pricePaise: 799900,
    currency: 'INR',
    stock: 34,
    tags: ['ssd', 'storage', 'portable', 'backup', '1tb'],
    attributes: [
      { key: 'capacity', label: 'Capacity', value: '1TB' },
      { key: 'speed', label: 'Speed', value: '1050 MB/s read' },
      { key: 'interface', label: 'Interface', value: 'USB 3.2 Gen 2' },
      { key: 'durability', label: 'Durability', value: 'Drop resistant' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      '1TB portable SSD at 1050MB/s — dependable backup and project storage for creators and devs.',
  },
  {
    id: 'cable-usbc-100w',
    name: 'Volt 100W USB-C Cable (2m)',
    brand: 'Volt',
    category: 'Cables',
    description:
      'A braided 2m USB-C to USB-C cable rated for 100W charging and USB 3.2 data. The cable that outlives your devices.',
    pricePaise: 49900,
    currency: 'INR',
    stock: 300,
    tags: ['cable', 'usb-c', 'charging', 'braided', 'accessory', 'travel'],
    attributes: [
      { key: 'length', label: 'Length', value: '2 m' },
      { key: 'power', label: 'Power', value: '100W PD' },
      { key: 'data', label: 'Data', value: 'USB 3.2 Gen 2' },
      { key: 'build', label: 'Build', value: 'Braided nylon' },
    ],
    policy: { freeShippingAbovePaise: 99900, returnDays: 14, etaDays: 3 },
    agentBlurb:
      '2m braided 100W USB-C cable — the cheap, high-margin add-on every laptop owner eventually needs.',
  },
];

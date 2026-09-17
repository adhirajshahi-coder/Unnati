/**
 * Localisation — FR-10, "regional languages and voice-assisted input".
 *
 * Hindi and English ship here. The dictionary is a flat object rather than an i18n
 * library because the string count is small and a build-time-checked `Record` catches
 * a missing translation at compile time, which a runtime lookup would not.
 *
 * Numbers stay in Latin digits in both languages: Devanagari numerals are not what
 * price boards, weighbridge slips or UPI apps use, and mismatching them is a real
 * source of confusion in the field.
 */
export type Lang = "en" | "hi";

export const LANGUAGES: Array<{ code: Lang; label: string; native: string }> = [
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "en", label: "English", native: "English" },
];

const dict = {
  /* chrome */
  appName: { en: "UNNATI", hi: "उन्नति" },
  tagline: {
    en: "Less Loss, More Profit",
    hi: "कम नुकसान, ज़्यादा मुनाफ़ा",
  },
  signIn: { en: "Sign in", hi: "लॉग इन करें" },
  signOut: { en: "Sign out", hi: "लॉग आउट" },
  phone: { en: "Phone number", hi: "मोबाइल नंबर" },
  pin: { en: "4-digit PIN", hi: "4 अंकों का पिन" },
  register: { en: "Create account", hi: "नया खाता बनाएँ" },
  name: { en: "Name", hi: "नाम" },
  village: { en: "Village", hi: "गाँव" },
  language: { en: "Language", hi: "भाषा" },
  back: { en: "Back", hi: "वापस" },
  cancel: { en: "Cancel", hi: "रद्द करें" },
  confirm: { en: "Confirm", hi: "पुष्टि करें" },
  loading: { en: "Loading…", hi: "लोड हो रहा है…" },

  /* roles */
  farmer: { en: "Farmer", hi: "किसान" },
  operator: { en: "Truck owner", hi: "ट्रक मालिक" },
  admin: { en: "Admin", hi: "प्रशासक" },

  /* navigation */
  home: { en: "Home", hi: "होम" },
  sell: { en: "Sell produce", hi: "उपज बेचें" },
  myTrips: { en: "My trips", hi: "मेरी यात्राएँ" },
  earnings: { en: "Earnings", hi: "कमाई" },
  notifications: { en: "Alerts", hi: "सूचनाएँ" },
  trucks: { en: "Trucks", hi: "ट्रक" },
  dashboard: { en: "Dashboard", hi: "डैशबोर्ड" },

  /* selling flow */
  whatDidYouHarvest: {
    en: "What have you harvested?",
    hi: "आपने क्या फ़सल काटी है?",
  },
  crop: { en: "Crop", hi: "फ़सल" },
  quantity: { en: "Quantity", hi: "मात्रा" },
  quintal: { en: "quintal", hi: "क्विंटल" },
  kg: { en: "kg", hi: "किलो" },
  grade: { en: "Quality", hi: "गुणवत्ता" },
  gradeA: { en: "Best", hi: "सबसे अच्छी" },
  gradeB: { en: "Average", hi: "मध्यम" },
  gradeC: { en: "Low", hi: "कम" },
  harvestedWhen: { en: "Harvested", hi: "कटाई कब हुई" },
  findBestMandi: { en: "Find the best mandi", hi: "सबसे अच्छी मंडी खोजें" },

  /* results */
  bestChoice: { en: "Best for you", hi: "आपके लिए सबसे अच्छा" },
  youTakeHome: { en: "You take home", hi: "आपको मिलेंगे" },
  mandiPrice: { en: "Mandi price", hi: "मंडी भाव" },
  transport: { en: "Transport", hi: "ढुलाई" },
  commission: { en: "Commission", hi: "आढ़त" },
  marketFee: { en: "Market fee", hi: "मंडी शुल्क" },
  spoilage: { en: "Spoilage loss", hi: "ख़राबी का नुकसान" },
  netPrice: { en: "Net price", hi: "शुद्ध कीमत" },
  distance: { en: "Distance", hi: "दूरी" },
  travelTime: { en: "Travel time", hi: "यात्रा समय" },
  moreThanNearest: {
    en: "more than your nearest mandi",
    hi: "आपकी नज़दीकी मंडी से ज़्यादा",
  },
  perQuintal: { en: "per quintal", hi: "प्रति क्विंटल" },
  sharedTruck: { en: "Shared truck", hi: "साझा ट्रक" },
  ownTruck: { en: "Hire full truck", hi: "पूरा ट्रक बुक करें" },

  /* pooling */
  poolingAvailable: {
    en: "A truck is already going there",
    hi: "एक ट्रक पहले से वहाँ जा रहा है",
  },
  joinTruck: { en: "Share this truck", hi: "यह ट्रक साझा करें" },
  youSave: { en: "You save", hi: "आपकी बचत" },
  spaceLeft: { en: "space left", hi: "जगह बची है" },
  departs: { en: "Departs", hi: "रवाना" },
  costSplit: { en: "Cost split", hi: "खर्च का बँटवारा" },
  yourShare: { en: "Your share", hi: "आपका हिस्सा" },
  farmersSharing: { en: "farmers sharing", hi: "किसान साझा कर रहे हैं" },

  /* tracking */
  track: { en: "Track truck", hi: "ट्रक देखें" },
  onTheWay: { en: "On the way", hi: "रास्ते में" },
  delivered: { en: "Delivered", hi: "पहुँच गया" },
  lastSeen: { en: "Last seen", hi: "आख़िरी बार देखा गया" },
  pickupOrder: { en: "Pickup order", hi: "उठाने का क्रम" },

  /* money */
  due: { en: "Due", hi: "बाकी" },
  paid: { en: "Paid", hi: "भुगतान हो गया" },
  payNow: { en: "Pay now", hi: "अभी भुगतान करें" },
  dueIn7Days: {
    en: "Payment due in 7 days",
    hi: "भुगतान 7 दिन में देना है",
  },

  /* advisory */
  handlingTip: { en: "Handling advice", hi: "रख-रखाव की सलाह" },
  dispatchBy: { en: "Send by", hi: "इससे पहले भेजें" },
  spoilageWarning: {
    en: "Send soon — this crop will not keep",
    hi: "जल्दी भेजें — यह फ़सल ज़्यादा नहीं टिकेगी",
  },

  /* operator */
  addTruck: { en: "Add a truck", hi: "ट्रक जोड़ें" },
  openTrip: { en: "Start a trip", hi: "यात्रा शुरू करें" },
  bestFill: { en: "Best fill suggestion", hi: "सबसे अच्छी भराई" },
  fillRate: { en: "Fill rate", hi: "भराई दर" },
  pendingRequests: { en: "Pending requests", hi: "बाकी अनुरोध" },
  accept: { en: "Accept", hi: "स्वीकार करें" },
  reject: { en: "Reject", hi: "अस्वीकार करें" },
  capacity: { en: "Capacity", hi: "क्षमता" },
  registration: { en: "Vehicle number", hi: "गाड़ी नंबर" },
  ratePerKm: { en: "Rate per km", hi: "प्रति किमी दर" },
  markInTransit: { en: "Start journey", hi: "यात्रा शुरू करें" },
  markDelivered: { en: "Mark delivered", hi: "पहुँचा दिया" },

  /* crops and mandis */
  searchCrop: { en: "Search crop", hi: "फ़सल खोजें" },
  moreCrops: { en: "More crops", hi: "और फ़सलें" },
  showLess: { en: "Show fewer", hi: "कम दिखाएँ" },
  addCrop: { en: "Add a crop", hi: "नई फ़सल जोड़ें" },
  cropNotListed: {
    en: "Crop not in the list?",
    hi: "आपकी फ़सल सूची में नहीं है?",
  },
  cropNameEn: { en: "Crop name (English)", hi: "फ़सल का नाम (अंग्रेज़ी)" },
  cropNameHi: { en: "Crop name (Hindi)", hi: "फ़सल का नाम (हिन्दी)" },
  keepsFor: { en: "Keeps for", hi: "कितने दिन टिकती है" },
  days: { en: "days", hi: "दिन" },
  saveCrop: { en: "Save crop", hi: "फ़सल सहेजें" },
  nearbyMandis: { en: "Nearby mandis", hi: "आस-पास की मंडियाँ" },
  // Short forms for the bottom bar, where a wrapped label leaves the row ragged.
  mandis: { en: "Mandis", hi: "मंडी" },
  trips: { en: "Trips", hi: "यात्रा" },
  todaysPrice: { en: "Today’s price", hi: "आज का भाव" },
  livePrice: { en: "Live", hi: "लाइव" },
  noPriceToday: { en: "No price reported today", hi: "आज भाव नहीं आया" },
  allCrops: { en: "All crops", hi: "सभी फ़सलें" },
  myLocation: { en: "My location", hi: "मेरी जगह" },
  changeLocation: { en: "Change location", hi: "जगह बदलें" },
  saveLocation: { en: "Save", hi: "सहेजें" },
  refreshPrices: { en: "Refresh live prices", hi: "लाइव भाव लाएँ" },

  /* farmer-led pooling groups */
  shareOption: { en: "Share a truck", hi: "ट्रक साझा करें" },
  fullTruckOption: { en: "Whole truck, alone", hi: "पूरा ट्रक, अकेले" },
  startGroup: { en: "Start a shared truck", hi: "साझा ट्रक शुरू करें" },
  joinGroup: { en: "Join this group", hi: "इस समूह में जुड़ें" },
  leaveGroup: { en: "Leave the group", hi: "समूह छोड़ें" },
  groupGathering: { en: "Farmers gathering", hi: "किसान जुड़ रहे हैं" },
  groupFor: { en: "Group going to", hi: "समूह जा रहा है" },
  inTheGroup: { en: "In the group", hi: "समूह में" },
  needMore: { en: "still needed", hi: "और चाहिए" },
  waitingForTruck: { en: "Waiting for a truck", hi: "ट्रक का इंतज़ार" },
  readyForTruck: { en: "Ready for a truck", hi: "ट्रक के लिए तैयार" },
  gotATruck: { en: "Truck booked", hi: "ट्रक मिल गया" },
  yourCostNow: { en: "Your cost at this size", hi: "अभी के हिसाब से आपका खर्च" },
  yourCostFull: { en: "If the truck fills", hi: "ट्रक भर जाए तो" },
  aloneYouPay: { en: "Alone you would pay", hi: "अकेले आपको देना पड़ता" },
  inviteNeighbours: {
    en: "The more neighbours join, the less each of you pays.",
    hi: "जितने ज़्यादा पड़ोसी जुड़ेंगे, उतना कम खर्च सबका।",
  },
  groupsNearby: { en: "Groups near you", hi: "आपके पास के समूह" },
  groupsWaiting: { en: "Groups waiting for a truck", hi: "ट्रक का इंतज़ार करते समूह" },
  claimGroup: { en: "Take this group", hi: "यह समूह लें" },
  myGroups: { en: "My groups", hi: "मेरे समूह" },

  /* help and collaboration */
  help: { en: "Help", hi: "मदद" },
  connect: { en: "Connect", hi: "जुड़ें" },
  instantHelp: { en: "Instant help", hi: "तुरंत मदद" },
  askQuestion: { en: "Ask", hi: "पूछें" },
  settings: { en: "Settings", hi: "सेटिंग" },
  whatsappAlerts: { en: "WhatsApp alerts", hi: "व्हाट्सएप सूचनाएँ" },

  /* empty states */
  noTrips: { en: "No trips yet", hi: "अभी कोई यात्रा नहीं" },
  noAlerts: { en: "No alerts", hi: "कोई सूचना नहीं" },
  noMandis: {
    en: "No mandi has a recent price for this crop nearby.",
    hi: "आस-पास किसी मंडी का इस फ़सल का ताज़ा भाव नहीं है।",
  },
} satisfies Record<string, Record<Lang, string>>;

export type MessageKey = keyof typeof dict;

/** Translate. Falls back to English if a Hindi string is ever missing. */
export function t(key: MessageKey, lang: Lang): string {
  const entry = dict[key] as Record<Lang, string>;
  return entry[lang] ?? entry.en;
}

/** Bind a language once and translate many times: `const tr = translator(lang)`. */
export function translator(lang: Lang) {
  return (key: MessageKey) => t(key, lang);
}

/**
 * Indian digit grouping — ₹1,23,456 rather than ₹123,456. Getting this wrong is an
 * immediate signal to an Indian user that the app was not built for them.
 */
export function rupees(amount: number, withSymbol = true): string {
  const n = Math.round(amount);
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
  return `${n < 0 ? "−" : ""}${withSymbol ? "₹" : ""}${formatted}`;
}

/** Weights read more naturally in quintals once they pass 100 kg. */
export function weight(kg: number, lang: Lang): string {
  if (kg >= 100) {
    const q = kg / 100;
    const s = q % 1 === 0 ? q.toFixed(0) : q.toFixed(1);
    return `${s} ${t("quintal", lang)}`;
  }
  return `${kg} ${t("kg", lang)}`;
}

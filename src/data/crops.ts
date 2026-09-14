/**
 * Crop catalogue.
 *
 * `agmarknetName` is the commodity string as the government feed spells it; it is what
 * lets a live price find its crop. Where the feed has no matching commodity the field
 * is null and the crop keeps whatever price was last entered by hand.
 *
 * `sanePriceMin`/`sanePriceMax` bound a believable modal price in rupees per quintal.
 * The Agmarknet feed carries real outliers — a misplaced decimal, or a herb quoted by
 * a different convention — and the worst thing this app could do is send a farmer
 * 200 km on a bad number. Anything outside the range is rejected at ingest.
 *
 * Shelf life is un-refrigerated hours from harvest before quality degrades materially;
 * spoilage rate is the fraction of value lost per day over that window.
 */
export interface CropSeed {
  id: string;
  name: string;
  nameHi: string;
  category: "VEGETABLE" | "FRUIT" | "GRAIN" | "PULSE" | "OILSEED";
  shelfLifeHours: number;
  spoilageRatePerDay: number;
  perishability: "HIGH" | "MEDIUM" | "LOW";
  agmarknetName: string | null;
  sanePriceMin: number;
  sanePriceMax: number;
  handlingTip: string;
  handlingTipHi: string;
}

export const CROPS: CropSeed[] = [
  /* ------------------------------------------------------------ vegetables */
  {
    id: "onion",
    name: "Onion",
    nameHi: "प्याज़",
    category: "VEGETABLE",
    shelfLifeHours: 720,
    spoilageRatePerDay: 0.012,
    perishability: "MEDIUM",
    agmarknetName: "Onion",
    sanePriceMin: 400,
    sanePriceMax: 6000,
    handlingTip:
      "Cure in shade for 2–3 days before loading. Use ventilated mesh bags, never sealed plastic. Do not stack more than 8 bags high.",
    handlingTipHi:
      "लोड करने से पहले 2–3 दिन छाँव में सुखाएँ। जालीदार बोरी इस्तेमाल करें, बंद प्लास्टिक कभी नहीं। 8 बोरी से ऊँचा न लगाएँ।",
  },
  {
    id: "tomato",
    name: "Tomato",
    nameHi: "टमाटर",
    category: "VEGETABLE",
    shelfLifeHours: 72,
    spoilageRatePerDay: 0.085,
    perishability: "HIGH",
    agmarknetName: "Tomato",
    sanePriceMin: 300,
    sanePriceMax: 9000,
    handlingTip:
      "Harvest at breaker stage for distant mandis. Pack in crates, not sacks — sacks crush the bottom layer. Load in the cool of early morning.",
    handlingTipHi:
      "दूर की मंडी के लिए हल्का कच्चा तोड़ें। बोरी नहीं, क्रेट में भरें — बोरी में नीचे की परत दब जाती है। सुबह ठंडे समय लोड करें।",
  },
  {
    id: "potato",
    name: "Potato",
    nameHi: "आलू",
    category: "VEGETABLE",
    shelfLifeHours: 1440,
    spoilageRatePerDay: 0.008,
    perishability: "LOW",
    agmarknetName: "Potato",
    sanePriceMin: 300,
    sanePriceMax: 5000,
    handlingTip:
      "Keep out of sunlight — greened tubers are rejected at the mandi. Do not wash before dispatch; surface moisture starts rot in transit.",
    handlingTipHi:
      "धूप से बचाएँ — हरे पड़े आलू मंडी में नहीं बिकते। भेजने से पहले न धोएँ; गीलापन रास्ते में सड़न शुरू कर देता है।",
  },
  {
    id: "cauliflower",
    name: "Cauliflower",
    nameHi: "फूलगोभी",
    category: "VEGETABLE",
    shelfLifeHours: 96,
    spoilageRatePerDay: 0.07,
    perishability: "HIGH",
    agmarknetName: "Cauliflower",
    sanePriceMin: 200,
    sanePriceMax: 6000,
    handlingTip:
      "Leave two rings of jacket leaves on to protect the curd. Cut in the early morning and keep shaded — curds yellow fast in sun.",
    handlingTipHi:
      "फूल की सुरक्षा के लिए दो परत पत्ते लगे रहने दें। सुबह जल्दी काटें और छाँव में रखें — धूप में फूल जल्दी पीला पड़ता है।",
  },
  {
    id: "cabbage",
    name: "Cabbage",
    nameHi: "पत्तागोभी",
    category: "VEGETABLE",
    shelfLifeHours: 240,
    spoilageRatePerDay: 0.03,
    perishability: "MEDIUM",
    agmarknetName: "Cabbage",
    sanePriceMin: 200,
    sanePriceMax: 4000,
    handlingTip:
      "Trim the stalk flush but keep the outer wrapper leaves — they take the bruising instead of the head.",
    handlingTipHi:
      "डंठल पास से काटें पर ऊपरी पत्ते रहने दें — चोट वही सहते हैं, गोभी बची रहती है।",
  },
  {
    id: "brinjal",
    name: "Brinjal",
    nameHi: "बैंगन",
    category: "VEGETABLE",
    shelfLifeHours: 96,
    spoilageRatePerDay: 0.06,
    perishability: "HIGH",
    agmarknetName: "Brinjal",
    sanePriceMin: 200,
    sanePriceMax: 6000,
    handlingTip:
      "Cut with the calyx and a short stalk attached — pulled fruit tears and rots from the scar. Never stack more than three crates deep.",
    handlingTipHi:
      "डंठल सहित काटें — खींचकर तोड़ा फल कटे हिस्से से सड़ता है। तीन क्रेट से ज़्यादा ऊपर-नीचे न रखें।",
  },
  {
    id: "okra",
    name: "Okra (Ladyfinger)",
    nameHi: "भिंडी",
    category: "VEGETABLE",
    shelfLifeHours: 60,
    spoilageRatePerDay: 0.1,
    perishability: "HIGH",
    agmarknetName: "Bhindi(Ladies Finger)",
    sanePriceMin: 300,
    sanePriceMax: 8000,
    handlingTip:
      "Pick every second day; over-mature pods are fibrous and fetch nothing. Handle gently — finger marks blacken within hours.",
    handlingTipHi:
      "एक दिन छोड़कर तोड़ें; ज़्यादा पकी भिंडी रेशेदार होकर बिकती नहीं। हल्के हाथ से पकड़ें — उँगली के निशान घंटों में काले पड़ जाते हैं।",
  },
  {
    id: "green-chilli",
    name: "Green Chilli",
    nameHi: "हरी मिर्च",
    category: "VEGETABLE",
    shelfLifeHours: 120,
    spoilageRatePerDay: 0.055,
    perishability: "HIGH",
    agmarknetName: "Green Chilli",
    sanePriceMin: 500,
    sanePriceMax: 15000,
    handlingTip:
      "Dry the surface before bagging — chillies packed damp heat up and rot from the middle of the sack outward.",
    handlingTipHi:
      "बोरी में भरने से पहले ऊपर की नमी सुखाएँ — गीली मिर्च बोरी के बीच से गरम होकर सड़ने लगती है।",
  },
  {
    id: "cucumber",
    name: "Cucumber",
    nameHi: "खीरा",
    category: "VEGETABLE",
    shelfLifeHours: 96,
    spoilageRatePerDay: 0.07,
    perishability: "HIGH",
    agmarknetName: "Cucumbar(Kheera)",
    sanePriceMin: 200,
    sanePriceMax: 5000,
    handlingTip:
      "Keep away from tomatoes and bananas in the truck — the ripening gas they give off yellows cucumbers within a day.",
    handlingTipHi:
      "ट्रक में टमाटर और केले से अलग रखें — उनसे निकलने वाली गैस खीरे को एक ही दिन में पीला कर देती है।",
  },
  {
    id: "bottle-gourd",
    name: "Bottle Gourd",
    nameHi: "लौकी",
    category: "VEGETABLE",
    shelfLifeHours: 168,
    spoilageRatePerDay: 0.04,
    perishability: "MEDIUM",
    agmarknetName: "Bottle gourd",
    sanePriceMin: 200,
    sanePriceMax: 4000,
    handlingTip:
      "Load lengthwise in a single layer. A gourd that rolls loose in the truck bruises along one side and is graded down.",
    handlingTipHi:
      "लंबाई में एक ही परत में लगाएँ। ट्रक में लुढ़कती लौकी एक तरफ़ से दब जाती है और भाव गिर जाता है।",
  },
  {
    id: "bitter-gourd",
    name: "Bitter Gourd",
    nameHi: "करेला",
    category: "VEGETABLE",
    shelfLifeHours: 120,
    spoilageRatePerDay: 0.055,
    perishability: "HIGH",
    agmarknetName: "Bitter gourd",
    sanePriceMin: 300,
    sanePriceMax: 7000,
    handlingTip:
      "Harvest while still dark green. Any yellowing at the tip means it will turn fully on the road and be unsellable.",
    handlingTipHi:
      "गहरा हरा रहते ही तोड़ें। सिरे पर पीलापन दिखे तो रास्ते में पूरा पीला होकर बिकने लायक नहीं बचेगा।",
  },
  {
    id: "peas",
    name: "Green Peas",
    nameHi: "मटर",
    category: "VEGETABLE",
    shelfLifeHours: 72,
    spoilageRatePerDay: 0.08,
    perishability: "HIGH",
    agmarknetName: "Green Peas",
    sanePriceMin: 500,
    sanePriceMax: 12000,
    handlingTip:
      "Pods lose sugar by the hour once picked. Dispatch the same day — peas sent next morning grade a full step lower.",
    handlingTipHi:
      "तोड़ने के बाद फली की मिठास हर घंटे घटती है। उसी दिन भेजें — अगली सुबह भेजी मटर एक दर्जा नीचे बिकती है।",
  },
  {
    id: "carrot",
    name: "Carrot",
    nameHi: "गाजर",
    category: "VEGETABLE",
    shelfLifeHours: 336,
    spoilageRatePerDay: 0.025,
    perishability: "MEDIUM",
    agmarknetName: "Carrot",
    sanePriceMin: 200,
    sanePriceMax: 5000,
    handlingTip:
      "Cut the tops off before loading. Leaves left on keep drawing moisture out of the root and it goes limp in transit.",
    handlingTipHi:
      "लोड करने से पहले ऊपर के पत्ते काट दें। पत्ते लगे रहने पर गाजर से नमी खिंचती रहती है और वह रास्ते में मुरझा जाती है।",
  },
  {
    id: "spinach",
    name: "Spinach",
    nameHi: "पालक",
    category: "VEGETABLE",
    shelfLifeHours: 36,
    spoilageRatePerDay: 0.18,
    perishability: "HIGH",
    agmarknetName: "Spinach",
    sanePriceMin: 200,
    sanePriceMax: 6000,
    handlingTip:
      "The most perishable thing you can send. Cut before sunrise, sprinkle lightly, and only send to a mandi you can reach within a few hours.",
    handlingTipHi:
      "सबसे जल्दी खराब होने वाली फसल। सूरज निकलने से पहले काटें, हल्का छिड़काव करें, और सिर्फ़ उसी मंडी भेजें जहाँ कुछ घंटों में पहुँच सकें।",
  },
  {
    id: "coriander",
    name: "Coriander (Leaves)",
    nameHi: "धनिया पत्ती",
    category: "VEGETABLE",
    shelfLifeHours: 36,
    spoilageRatePerDay: 0.2,
    perishability: "HIGH",
    agmarknetName: "Coriander(Leaves)",
    sanePriceMin: 300,
    sanePriceMax: 12000,
    handlingTip:
      "Bundle loosely and stand upright with the stems damp. Packed flat and tight, the middle of the load heats and blackens.",
    handlingTipHi:
      "ढीली गड्डी बाँधें और डंठल गीले रखकर खड़ा लगाएँ। दबाकर सपाट रखने पर बीच का हिस्सा गरम होकर काला पड़ जाता है।",
  },
  {
    id: "garlic",
    name: "Garlic",
    nameHi: "लहसुन",
    category: "VEGETABLE",
    shelfLifeHours: 2160,
    spoilageRatePerDay: 0.006,
    perishability: "LOW",
    agmarknetName: "Garlic",
    sanePriceMin: 1000,
    sanePriceMax: 30000,
    handlingTip:
      "Cure until the necks are papery dry. Any softness at the neck means the bulb will rot in the middle of the sack.",
    handlingTipHi:
      "गर्दन पूरी तरह सूखकर कागज़ जैसी होने तक सुखाएँ। गर्दन नरम रही तो गाँठ बोरी के बीच में सड़ जाएगी।",
  },
  {
    id: "ginger",
    name: "Ginger",
    nameHi: "अदरक",
    category: "VEGETABLE",
    shelfLifeHours: 720,
    spoilageRatePerDay: 0.015,
    perishability: "MEDIUM",
    agmarknetName: "Ginger(Green)",
    sanePriceMin: 1000,
    sanePriceMax: 25000,
    handlingTip:
      "Leave the field soil on — washed ginger loses its skin barrier and moulds. Discard any rhizome with a soft brown patch.",
    handlingTipHi:
      "खेत की मिट्टी लगी रहने दें — धोया अदरक छिलके की सुरक्षा खोकर फफूँद पकड़ लेता है। जिसमें नरम भूरा दाग हो उसे अलग कर दें।",
  },

  /* ---------------------------------------------------------------- fruits */
  {
    id: "grape",
    name: "Grapes",
    nameHi: "अंगूर",
    category: "FRUIT",
    shelfLifeHours: 96,
    spoilageRatePerDay: 0.07,
    perishability: "HIGH",
    agmarknetName: "Grapes",
    sanePriceMin: 1000,
    sanePriceMax: 20000,
    handlingTip:
      "Pre-cool bunches before loading. Line crates with paper. Avoid any midday loading — pulp temperature above 30°C halves shelf life.",
    handlingTipHi:
      "लोड करने से पहले गुच्छों को ठंडा करें। क्रेट में कागज़ लगाएँ। दोपहर में लोड न करें — गूदे का तापमान 30°C से ऊपर जाने पर टिकाऊपन आधा रह जाता है।",
  },
  {
    id: "pomegranate",
    name: "Pomegranate",
    nameHi: "अनार",
    category: "FRUIT",
    shelfLifeHours: 480,
    spoilageRatePerDay: 0.02,
    perishability: "MEDIUM",
    agmarknetName: "Pomegranate",
    sanePriceMin: 1500,
    sanePriceMax: 25000,
    handlingTip:
      "Grade out cracked fruit before dispatch — one split fruit spoils the crate around it. Cushion with paper on all sides.",
    handlingTipHi:
      "भेजने से पहले फटे फल अलग करें — एक फटा फल पूरी क्रेट खराब कर देता है। चारों तरफ कागज़ लगाएँ।",
  },
  {
    id: "banana",
    name: "Banana",
    nameHi: "केला",
    category: "FRUIT",
    shelfLifeHours: 168,
    spoilageRatePerDay: 0.05,
    perishability: "HIGH",
    agmarknetName: "Banana",
    sanePriceMin: 300,
    sanePriceMax: 8000,
    handlingTip:
      "Send fully green for anything over four hours away. Keep hands off the truck floor — heat from the bed ripens the bottom tier first.",
    handlingTipHi:
      "चार घंटे से दूर की मंडी के लिए पूरा हरा भेजें। घौद ट्रक के फर्श से ऊपर रखें — फर्श की गर्मी से नीचे वाली परत पहले पक जाती है।",
  },
  {
    id: "mango",
    name: "Mango",
    nameHi: "आम",
    category: "FRUIT",
    shelfLifeHours: 240,
    spoilageRatePerDay: 0.045,
    perishability: "HIGH",
    agmarknetName: "Mango",
    sanePriceMin: 1000,
    sanePriceMax: 20000,
    handlingTip:
      "Harvest with a 1 cm stalk and let the sap drain stalk-down before packing — sap burn on the skin is the commonest cause of downgrading.",
    handlingTipHi:
      "1 सेमी डंठल सहित तोड़ें और पैक करने से पहले डंठल नीचे करके दूध निकलने दें — छिलके पर दूध का दाग ही भाव गिरने की सबसे आम वजह है।",
  },
  {
    id: "apple",
    name: "Apple",
    nameHi: "सेब",
    category: "FRUIT",
    shelfLifeHours: 720,
    spoilageRatePerDay: 0.015,
    perishability: "MEDIUM",
    agmarknetName: "Apple",
    sanePriceMin: 2000,
    sanePriceMax: 30000,
    handlingTip:
      "Pack in trays, never loose. A single bruised apple gives off enough ripening gas to soften the whole box on a long run.",
    handlingTipHi:
      "ट्रे में पैक करें, खुला कभी नहीं। एक दबा हुआ सेब इतनी गैस छोड़ता है कि लंबे सफ़र में पूरी पेटी नरम पड़ जाती है।",
  },
  {
    id: "papaya",
    name: "Papaya",
    nameHi: "पपीता",
    category: "FRUIT",
    shelfLifeHours: 144,
    spoilageRatePerDay: 0.06,
    perishability: "HIGH",
    agmarknetName: "Papaya",
    sanePriceMin: 300,
    sanePriceMax: 6000,
    handlingTip:
      "Send at colour-break, never fully yellow. Wrap each fruit — papaya skin marks from the lightest contact and the mark spreads.",
    handlingTipHi:
      "हल्का रंग बदलते ही भेजें, पूरा पीला कभी नहीं। हर फल लपेटें — पपीते का छिलका हल्की रगड़ से भी दाग पकड़ता है और दाग फैलता है।",
  },
  {
    id: "orange",
    name: "Orange",
    nameHi: "संतरा",
    category: "FRUIT",
    shelfLifeHours: 480,
    spoilageRatePerDay: 0.022,
    perishability: "MEDIUM",
    agmarknetName: "Orange",
    sanePriceMin: 800,
    sanePriceMax: 15000,
    handlingTip:
      "Clip the stalk flush with the fruit. A protruding stalk punctures the neighbouring orange and both rot.",
    handlingTipHi:
      "डंठल फल के बराबर से काटें। बाहर निकला डंठल पास वाले संतरे में छेद कर देता है और दोनों सड़ जाते हैं।",
  },

  /* ---------------------------------------------------------------- grains */
  {
    id: "wheat",
    name: "Wheat",
    nameHi: "गेहूँ",
    category: "GRAIN",
    shelfLifeHours: 4320,
    spoilageRatePerDay: 0.002,
    perishability: "LOW",
    agmarknetName: "Wheat",
    sanePriceMin: 1500,
    sanePriceMax: 5000,
    handlingTip:
      "Dry to under 12% moisture before bagging. Keep bags off bare ground on the truck bed to avoid condensation damage.",
    handlingTipHi:
      "बोरी भरने से पहले 12% से कम नमी तक सुखाएँ। ट्रक में बोरियाँ ज़मीन से ऊपर रखें ताकि सीलन न लगे।",
  },
  {
    id: "paddy",
    name: "Paddy",
    nameHi: "धान",
    category: "GRAIN",
    shelfLifeHours: 4320,
    spoilageRatePerDay: 0.002,
    perishability: "LOW",
    agmarknetName: "Paddy(Dhan)(Common)",
    sanePriceMin: 1200,
    sanePriceMax: 5000,
    handlingTip:
      "Moisture above 17% is rejected outright at procurement. Sun-dry on a clean floor and test before loading, not after arriving.",
    handlingTipHi:
      "17% से ज़्यादा नमी पर खरीद में सीधे मना कर देते हैं। साफ़ फर्श पर धूप में सुखाएँ और मंडी पहुँचने से पहले ही नमी जाँच लें।",
  },
  {
    id: "maize",
    name: "Maize",
    nameHi: "मक्का",
    category: "GRAIN",
    shelfLifeHours: 4320,
    spoilageRatePerDay: 0.002,
    perishability: "LOW",
    agmarknetName: "Maize",
    sanePriceMin: 1000,
    sanePriceMax: 4000,
    handlingTip:
      "Shell only once the grain is properly dry. Damp maize develops mould in the sack and the whole lot is written off.",
    handlingTipHi:
      "दाना पूरी तरह सूखने पर ही निकालें। गीली मक्का बोरी में फफूँद पकड़ लेती है और पूरा लॉट बेकार हो जाता है।",
  },
  {
    id: "bajra",
    name: "Bajra (Pearl Millet)",
    nameHi: "बाजरा",
    category: "GRAIN",
    shelfLifeHours: 4320,
    spoilageRatePerDay: 0.002,
    perishability: "LOW",
    agmarknetName: "Bajra(Pearl Millet/Cumbu)",
    sanePriceMin: 1000,
    sanePriceMax: 4000,
    handlingTip:
      "Winnow thoroughly — bajra carries a lot of chaff and mandi deductions for foreign matter are steep.",
    handlingTipHi:
      "अच्छी तरह ओसाएँ — बाजरे में भूसा ज़्यादा रहता है और मंडी में कचरे की कटौती भारी होती है।",
  },

  /* ----------------------------------------------------- pulses, oilseeds */
  {
    id: "gram",
    name: "Bengal Gram (Chana)",
    nameHi: "चना",
    category: "PULSE",
    shelfLifeHours: 4320,
    spoilageRatePerDay: 0.002,
    perishability: "LOW",
    agmarknetName: "Bengal Gram(Gram)(Whole)",
    sanePriceMin: 2500,
    sanePriceMax: 10000,
    handlingTip:
      "Check for weevil before bagging. One infested sack spreads through a stacked load and the buyer discounts the whole lot.",
    handlingTipHi:
      "बोरी भरने से पहले घुन देख लें। एक बोरी में घुन लगा हो तो पूरे लोड में फैलता है और खरीदार पूरे लॉट का भाव गिरा देता है।",
  },
  {
    id: "tur",
    name: "Tur / Arhar",
    nameHi: "तुअर / अरहर",
    category: "PULSE",
    shelfLifeHours: 4320,
    spoilageRatePerDay: 0.002,
    perishability: "LOW",
    agmarknetName: "Arhar (Tur/Red Gram)(Whole)",
    sanePriceMin: 3000,
    sanePriceMax: 14000,
    handlingTip:
      "Clean out stones and split grain before weighing. Splits are graded separately and drag the price down if mixed in.",
    handlingTipHi:
      "तौल से पहले पत्थर और टूटा दाना अलग करें। टूटन का दर्जा अलग होता है और मिला रहने पर पूरे लॉट का भाव गिरता है।",
  },
  {
    id: "moong",
    name: "Green Gram (Moong)",
    nameHi: "मूँग",
    category: "PULSE",
    shelfLifeHours: 4320,
    spoilageRatePerDay: 0.002,
    perishability: "LOW",
    agmarknetName: "Green Gram (Moong)(Whole)",
    sanePriceMin: 3000,
    sanePriceMax: 14000,
    handlingTip:
      "Store in a dry room until dispatch. Moong picks up moisture faster than other pulses and discoloured grain is graded down hard.",
    handlingTipHi:
      "भेजने तक सूखे कमरे में रखें। मूँग दूसरी दालों से जल्दी नमी पकड़ती है और रंग बदला दाना बहुत नीचे दर्जे में जाता है।",
  },
  {
    id: "soybean",
    name: "Soybean",
    nameHi: "सोयाबीन",
    category: "OILSEED",
    shelfLifeHours: 2880,
    spoilageRatePerDay: 0.003,
    perishability: "LOW",
    agmarknetName: "Soyabean",
    sanePriceMin: 2000,
    sanePriceMax: 9000,
    handlingTip:
      "Clean out chaff and stones before weighing — mandi deductions for foreign matter are steep. Keep moisture under 10%.",
    handlingTipHi:
      "तौल से पहले भूसा और पत्थर साफ़ करें — मंडी में कचरे की कटौती भारी होती है। नमी 10% से कम रखें।",
  },
  {
    id: "mustard",
    name: "Mustard",
    nameHi: "सरसों",
    category: "OILSEED",
    shelfLifeHours: 4320,
    spoilageRatePerDay: 0.002,
    perishability: "LOW",
    agmarknetName: "Mustard",
    sanePriceMin: 2500,
    sanePriceMax: 10000,
    handlingTip:
      "Buyers test oil content, so drying matters more than looks. Seed above 8% moisture loses oil recovery and is paid less.",
    handlingTipHi:
      "खरीदार तेल की मात्रा जाँचते हैं, इसलिए दिखावट से ज़्यादा सुखाना ज़रूरी है। 8% से ऊपर नमी पर तेल कम निकलता है और भाव घटता है।",
  },
  {
    id: "groundnut",
    name: "Groundnut",
    nameHi: "मूँगफली",
    category: "OILSEED",
    shelfLifeHours: 2880,
    spoilageRatePerDay: 0.004,
    perishability: "LOW",
    agmarknetName: "Groundnut",
    sanePriceMin: 2500,
    sanePriceMax: 12000,
    handlingTip:
      "Dry pods until the kernel rattles inside. Under-dried groundnut grows aflatoxin mould, which fails testing outright.",
    handlingTipHi:
      "फली इतनी सुखाएँ कि दाना अंदर खड़कने लगे। कम सूखी मूँगफली में ज़हरीली फफूँद लग जाती है और जाँच में सीधे फेल हो जाती है।",
  },
  {
    id: "cotton",
    name: "Cotton",
    nameHi: "कपास",
    category: "OILSEED",
    shelfLifeHours: 4320,
    spoilageRatePerDay: 0.001,
    perishability: "LOW",
    agmarknetName: "Cotton",
    sanePriceMin: 3000,
    sanePriceMax: 12000,
    handlingTip:
      "Pick dry and keep the lot free of leaf trash. Contamination with plastic thread is the fastest way to lose a grade.",
    handlingTipHi:
      "सूखी चुनाई करें और पत्ती-कचरा न मिलने दें। प्लास्टिक की डोरी मिल जाना दर्जा गिरने की सबसे जल्दी वजह बनता है।",
  },
];

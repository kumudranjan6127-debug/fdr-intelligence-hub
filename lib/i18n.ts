// English / Hindi strings for the site chrome and the public pages. Officer screens stay in English;
// the footer says so. The chosen language lives in the `lang` cookie (see lib/lang.ts).

export type Lang = "en" | "hi";
export const LANG_COOKIE = "lang";

const STRINGS = {
  // utility bar
  sihLine: { en: "Smart India Hackathon 2026 prototype · Problem statement SIH26265", hi: "स्मार्ट इंडिया हैकथॉन 2026 प्रोटोटाइप · समस्या विवरण SIH26265" },
  skip: { en: "Skip to main content", hi: "मुख्य सामग्री पर जाएँ" },
  textSmaller: { en: "Decrease text size", hi: "टेक्स्ट छोटा करें" },
  textNormal: { en: "Normal text size", hi: "सामान्य टेक्स्ट" },
  textLarger: { en: "Increase text size", hi: "टेक्स्ट बड़ा करें" },
  contrast: { en: "High contrast", hi: "उच्च कंट्रास्ट" },
  // header
  brandTagline: { en: "Security Deposit & FDR Verification Portal", hi: "सुरक्षा जमा एवं एफडीआर सत्यापन पोर्टल" },
  prototypeFor: { en: "Prototype for", hi: "प्रोटोटाइप" },
  bureau: { en: "AICTE Regulation Bureau", hi: "एआईसीटीई विनियमन ब्यूरो" },
  council: { en: "All India Council for Technical Education", hi: "अखिल भारतीय तकनीकी शिक्षा परिषद" },
  today: { en: "Today", hi: "आज" },
  signIn: { en: "Sign in", hi: "साइन इन" },
  workspace: { en: "My workspace", hi: "मेरा कार्यक्षेत्र" },
  // menu
  navHome: { en: "Home", hi: "मुखपृष्ठ" },
  navVerify: { en: "Verify a NOC", hi: "एनओसी सत्यापन" },
  navHow: { en: "How it works", hi: "कार्यप्रणाली" },
  navDemo: { en: "Demo guide", hi: "डेमो गाइड" },
  navResults: { en: "Results", hi: "परिणाम" },
  navRules: { en: "Rules", hi: "नियम" },
  navFaq: { en: "FAQ", hi: "सामान्य प्रश्न" },
  menu: { en: "Main menu", hi: "मुख्य मेनू" },
  disclaimer: {
    en: "Prototype built for Smart India Hackathon 2026. Not an official AICTE or Government of India website. All institutions, banks, people and deposits shown are fictional demo data.",
    hi: "यह स्मार्ट इंडिया हैकथॉन 2026 के लिए बनाया गया प्रोटोटाइप है। यह एआईसीटीई या भारत सरकार की आधिकारिक वेबसाइट नहीं है। दिखाए गए सभी संस्थान, बैंक, व्यक्ति और जमा काल्पनिक डेमो डेटा हैं।",
  },
  // footer
  footAbout: { en: "About this portal", hi: "पोर्टल के बारे में" },
  footAboutBody: {
    en: "A verification-first register for the security deposits that technical institutions keep with AICTE: every field shows who vouched for it, every renewal chain is checked, and every lien-release NOC can be verified by QR.",
    hi: "तकनीकी संस्थानों द्वारा एआईसीटीई के पास रखी सुरक्षा जमा का सत्यापन-आधारित रजिस्टर: हर फ़ील्ड बताती है कि उसकी पुष्टि किसने की, हर नवीनीकरण श्रृंखला की जाँच होती है, और हर लियन-मुक्ति एनओसी QR से सत्यापित की जा सकती है।",
  },
  footLinks: { en: "Quick links", hi: "त्वरित लिंक" },
  footHelp: { en: "Help & accessibility", hi: "सहायता एवं सुगम्यता" },
  footA11y: {
    en: "Text size, high contrast and a skip link are in the top bar. Every status badge carries a text label, not colour alone.",
    hi: "टेक्स्ट का आकार, उच्च कंट्रास्ट और 'मुख्य सामग्री पर जाएँ' लिंक ऊपर की पट्टी में हैं। हर स्थिति बैज पर केवल रंग नहीं, टेक्स्ट भी है।",
  },
  footHindi: {
    en: "Hindi covers the menus and public pages; officer screens are in English.",
    hi: "हिंदी मेनू और सार्वजनिक पृष्ठों पर उपलब्ध है; अधिकारी स्क्रीन अंग्रेज़ी में हैं।",
  },
  footBoundary: {
    en: "Bank confirmation uses a Mock AA sandbox. Hashes are anchored in the database. A matching hash proves a record is unchanged, not that a bank issued it.",
    hi: "बैंक पुष्टि मॉक एए सैंडबॉक्स से होती है। हैश डेटाबेस में दर्ज होते हैं। मेल खाता हैश यह साबित करता है कि रिकॉर्ड नहीं बदला, यह नहीं कि बैंक ने उसे जारी किया।",
  },
  lastUpdated: { en: "Last updated", hi: "अंतिम अद्यतन" },
  // landing
  heroEyebrow: { en: "SIH 2026 · SIH26265 · Prototype for the AICTE Regulation Bureau", hi: "SIH 2026 · SIH26265 · एआईसीटीई विनियमन ब्यूरो के लिए प्रोटोटाइप" },
  heroTitleA: { en: "Every security deposit —", hi: "हर सुरक्षा जमा —" },
  heroTitleB: { en: "verified, not just recorded", hi: "केवल दर्ज नहीं, सत्यापित" },
  heroBody: {
    en: "Technical institutions keep a security deposit with AICTE for 10 years. This portal shows who vouched for every field, checks every renewal chain automatically, and makes every lien-release NOC verifiable with one QR scan.",
    hi: "तकनीकी संस्थान 10 वर्षों तक एआईसीटीई के पास सुरक्षा जमा रखते हैं। यह पोर्टल दिखाता है कि हर फ़ील्ड की पुष्टि किसने की, हर नवीनीकरण श्रृंखला की स्वतः जाँच करता है, और हर लियन-मुक्ति एनओसी को एक QR स्कैन से सत्यापित करने योग्य बनाता है।",
  },
  tryDemo: { en: "Try the live demo", hi: "लाइव डेमो देखें" },
  openWorkspace: { en: "Open my workspace", hi: "मेरा कार्यक्षेत्र खोलें" },
  heroNote: { en: "One-click demo accounts · fictional data · Mock AA sandbox", hi: "एक-क्लिक डेमो खाते · काल्पनिक डेटा · मॉक एए सैंडबॉक्स" },
  liveFrom: { en: "Live from the demo database", hi: "डेमो डेटाबेस से लाइव" },
  statDeposits: { en: "deposits tracked", hi: "जमा ट्रैक किए गए" },
  statInstitutions: { en: "institutions", hi: "संस्थान" },
  statDiscrepancies: { en: "open discrepancies flagged", hi: "खुली विसंगतियाँ" },
  statNocs: { en: "NOCs verifiable by QR", hi: "QR से सत्यापन योग्य एनओसी" },
  statEvents: { en: "hash-chained audit events", hi: "हैश-श्रृंखलित ऑडिट घटनाएँ" },
  secProblem: { en: "The problem today", hi: "आज की समस्या" },
  secProblemTitle: { en: "Ten years, many renewals, and no single source of truth.", hi: "दस वर्ष, कई नवीनीकरण, और सच्चाई का कोई एक स्रोत नहीं।" },
  secFeatures: { en: "What makes it different", hi: "यह अलग क्यों है" },
  secFeaturesTitle: { en: "Verification first. Not another register.", hi: "पहले सत्यापन। सिर्फ़ एक और रजिस्टर नहीं।" },
  secHow: { en: "How it works", hi: "यह कैसे काम करता है" },
  secHowTitle: { en: "From submission to a NOC anyone can check.", hi: "जमा करने से लेकर ऐसी एनओसी तक जिसे कोई भी जाँच सके।" },
  secHonest: { en: "Honest boundaries", hi: "स्पष्ट सीमाएँ" },
  secHonestTitle: { en: "What is real, and what is a sandbox.", hi: "क्या वास्तविक है, और क्या सैंडबॉक्स।" },
  secRoadmap: { en: "Roadmap", hi: "आगे की योजना" },
  secRoadmapTitle: { en: "Built to grow into production.", hi: "उत्पादन तक बढ़ने के लिए बनाया गया।" },
  secJudges: { en: "For judges", hi: "निर्णायकों के लिए" },
  secJudgesTitle: { en: "See the whole journey in five minutes.", hi: "पूरी प्रक्रिया पाँच मिनट में देखें।" },
  secJudgesBody: {
    en: "Sign in as an institution, an AICTE officer or a bank. Submit a deposit, catch a mismatch, issue a NOC, download its PDF and try to tamper with it.",
    hi: "संस्थान, एआईसीटीई अधिकारी या बैंक के रूप में साइन इन करें। जमा दर्ज करें, विसंगति पकड़ें, एनओसी जारी करें, उसकी PDF डाउनलोड करें और उसमें छेड़छाड़ करके देखें।",
  },
  demoPassword: { en: "Password for every demo account", hi: "हर डेमो खाते का पासवर्ड" },
  secFaq: { en: "Questions", hi: "प्रश्न" },
  secFaqTitle: { en: "Frequently asked questions", hi: "अक्सर पूछे जाने वाले प्रश्न" },
  // login / verify
  signInTitle: { en: "Sign in", hi: "साइन इन" },
  signInSub: { en: "Access the security deposit and FDR portal with your account or a demo account.", hi: "अपने खाते या डेमो खाते से सुरक्षा जमा एवं एफडीआर पोर्टल में प्रवेश करें।" },
  verifyTitle: { en: "Verify a lien-release NOC", hi: "लियन-मुक्ति एनओसी सत्यापित करें" },
  verifySub: { en: "Scan the QR on the letter, or enter the NOC number printed under the title. No sign-in needed.", hi: "पत्र पर दिया QR स्कैन करें, या शीर्षक के नीचे छपा एनओसी नंबर दर्ज करें। साइन इन की आवश्यकता नहीं।" },
  verifyButton: { en: "Verify", hi: "सत्यापित करें" },
} as const satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}

export function asLang(v: string | undefined | null): Lang {
  return v === "hi" ? "hi" : "en";
}

export type Faq = { q: Record<Lang, string>; a: Record<Lang, string> };

export const FAQ: Faq[] = [
  {
    q: { en: "What is a security deposit and why does AICTE hold it?", hi: "सुरक्षा जमा क्या है और एआईसीटीई इसे क्यों रखती है?" },
    a: {
      en: "An institution approved by AICTE keeps a security deposit, usually a Fixed Deposit Receipt (FDR) with a lien in favour of the Member Secretary, AICTE. It protects students and the Council if the institution closes or fails its obligations, and it is released once the conditions are met.",
      hi: "एआईसीटीई से अनुमोदित संस्थान सुरक्षा जमा रखता है, आमतौर पर सदस्य सचिव, एआईसीटीई के पक्ष में लियन वाली सावधि जमा रसीद (एफडीआर)। यह संस्थान के बंद होने या दायित्व पूरे न करने पर छात्रों और परिषद की रक्षा करती है, और शर्तें पूरी होने पर मुक्त की जाती है।",
    },
  },
  {
    q: { en: "What do Claimed, Extracted and Confirmed mean?", hi: "दावा, निकाला गया और पुष्ट का क्या अर्थ है?" },
    a: {
      en: "Claimed is what the institution typed. Extracted is what AI read from the uploaded document, with a confidence score. Confirmed is what the bank returned. If any two disagree, the field turns red and the officer sees why.",
      hi: "दावा वह है जो संस्थान ने भरा। निकाला गया वह है जो एआई ने अपलोड किए दस्तावेज़ से पढ़ा, विश्वास स्कोर के साथ। पुष्ट वह है जो बैंक ने लौटाया। यदि कोई दो मेल नहीं खाते, तो फ़ील्ड लाल हो जाती है और अधिकारी कारण देखता है।",
    },
  },
  {
    q: { en: "What does “lien marked in favour of AICTE” mean?", hi: "“एआईसीटीई के पक्ष में लियन” का क्या अर्थ है?" },
    a: {
      en: "The bank records that the deposit cannot be encashed, pre-closed or pledged without AICTE's consent. A renewed FDR is a new instrument and needs a fresh lien; the renewal-chain check flags a renewal without one.",
      hi: "बैंक दर्ज करता है कि एआईसीटीई की सहमति के बिना जमा को भुनाया, समय से पहले बंद या गिरवी नहीं रखा जा सकता। नवीनीकृत एफडीआर एक नया साधन है और उसे नया लियन चाहिए; नवीनीकरण-श्रृंखला जाँच लियन के बिना नवीनीकरण को चिह्नित करती है।",
    },
  },
  {
    q: { en: "How can a bank check that a NOC is genuine?", hi: "बैंक कैसे जाँचे कि एनओसी असली है?" },
    a: {
      en: "Scan the QR on the NOC letter or PDF. The public verification page re-computes the record's SHA-256, compares it with the anchor taken at issue, and shows whether the NOC is valid or revoked. No sign-in is needed.",
      hi: "एनओसी पत्र या PDF पर दिया QR स्कैन करें। सार्वजनिक सत्यापन पृष्ठ रिकॉर्ड का SHA-256 दोबारा गणना करके जारी करते समय लिए गए एंकर से मिलाता है, और बताता है कि एनओसी मान्य है या रद्द। साइन इन की आवश्यकता नहीं।",
    },
  },
  {
    q: { en: "Is the bank confirmation real?", hi: "क्या बैंक पुष्टि वास्तविक है?" },
    a: {
      en: "Not yet. It runs on a Mock Account Aggregator sandbox that returns the same data shape a real Account Aggregator would, and every such value is labelled “Sandbox”. Outside demo mode, a NOC cannot be issued on sandbox evidence.",
      hi: "अभी नहीं। यह मॉक अकाउंट एग्रीगेटर सैंडबॉक्स पर चलता है जो वास्तविक अकाउंट एग्रीगेटर जैसा ही डेटा देता है, और हर ऐसे मान पर “सैंडबॉक्स” लिखा होता है। डेमो मोड के बाहर, सैंडबॉक्स साक्ष्य पर एनओसी जारी नहीं हो सकती।",
    },
  },
  {
    q: { en: "Is this the official AICTE portal?", hi: "क्या यह एआईसीटीई का आधिकारिक पोर्टल है?" },
    a: {
      en: "No. This is a Smart India Hackathon 2026 prototype for problem statement SIH26265. It is not an official website of AICTE or the Government of India, and all data on it is fictional.",
      hi: "नहीं। यह समस्या विवरण SIH26265 के लिए स्मार्ट इंडिया हैकथॉन 2026 का प्रोटोटाइप है। यह एआईसीटीई या भारत सरकार की आधिकारिक वेबसाइट नहीं है, और इस पर सारा डेटा काल्पनिक है।",
    },
  },
];

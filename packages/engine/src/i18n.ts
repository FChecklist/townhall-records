// Languages and the string catalogue. The public page has a language drop-down in the upper right; the same dictionary is embedded in every page
// (so the single sealed file still works offline) and is served at GET /api/i18n/:lang for the apps.
// Coverage is honest: English and Hindi are complete; the other languages cover the CORE keys and fall back to English for the rest.
// Translations other than English are drafts that need a native reader before launch (see docs/design/LANGUAGES.md).
export interface Language { code: string; name: string; native: string; dir: "ltr" | "rtl"; status: "complete" | "core" }
export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English", dir: "ltr", status: "complete" },
  { code: "hi", name: "Hindi", native: "हिन्दी", dir: "ltr", status: "complete" },
  { code: "mr", name: "Marathi", native: "मराठी", dir: "ltr", status: "core" },
  { code: "bn", name: "Bengali", native: "বাংলা", dir: "ltr", status: "core" },
  { code: "ta", name: "Tamil", native: "தமிழ்", dir: "ltr", status: "core" },
  { code: "te", name: "Telugu", native: "తెలుగు", dir: "ltr", status: "core" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", dir: "ltr", status: "core" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", dir: "ltr", status: "core" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", dir: "ltr", status: "core" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", dir: "ltr", status: "core" },
  { code: "ur", name: "Urdu", native: "اردو", dir: "rtl", status: "core" },
  { code: "es", name: "Spanish", native: "Español", dir: "ltr", status: "core" },
  { code: "fr", name: "French", native: "Français", dir: "ltr", status: "core" },
  { code: "pt", name: "Portuguese", native: "Português", dir: "ltr", status: "core" },
  { code: "ar", name: "Arabic", native: "العربية", dir: "rtl", status: "core" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文", dir: "ltr", status: "core" },
];
export const LANG_CODES = LANGUAGES.map((l) => l.code);
export const isLang = (c: unknown): c is string => typeof c === "string" && LANG_CODES.includes(c);

type M = Record<string, string>; // lang -> text; "en" always present
const CORE = true;
/** key -> translations. `core: true` keys are translated into every language. */
const CAT: Record<string, { core?: boolean; t: M }> = {
  "lang.label": { core: CORE, t: { en: "Language", hi: "भाषा", mr: "भाषा", bn: "ভাষা", ta: "மொழி", te: "భాష", gu: "ભાષા", kn: "ಭಾಷೆ", ml: "ഭാഷ", pa: "ਭਾਸ਼ਾ", ur: "زبان", es: "Idioma", fr: "Langue", pt: "Idioma", ar: "اللغة", zh: "语言" } },
  "page.live": { core: CORE, t: { en: "LIVE", hi: "लाइव", mr: "थेट", bn: "লাইভ", ta: "நேரலை", te: "ప్రత్యక్షం", gu: "લાઇવ", kn: "ನೇರ", ml: "തത്സമയം", pa: "ਲਾਈਵ", ur: "براہِ راست", es: "EN VIVO", fr: "EN DIRECT", pt: "AO VIVO", ar: "مباشر", zh: "直播" } },
  "page.final": { core: CORE, t: { en: "FINAL REPORT", hi: "अंतिम रिपोर्ट", mr: "अंतिम अहवाल", bn: "চূড়ান্ত প্রতিবেদন", ta: "இறுதி அறிக்கை", te: "తుది నివేదిక", gu: "અંતિમ અહેવાલ", kn: "ಅಂತಿಮ ವರದಿ", ml: "അന്തിമ റിപ്പോർട്ട്", pa: "ਅੰਤਿਮ ਰਿਪੋਰਟ", ur: "حتمی رپورٹ", es: "INFORME FINAL", fr: "RAPPORT FINAL", pt: "RELATÓRIO FINAL", ar: "التقرير النهائي", zh: "最终报告" } },
  "sec.schedule": { core: CORE, t: { en: "Schedule", hi: "समय-सारणी", mr: "वेळापत्रक", bn: "সময়সূচি", ta: "நிகழ்ச்சி நிரல்", te: "షెడ్యూల్", gu: "સમયપત્રક", kn: "ವೇಳಾಪಟ್ಟಿ", ml: "സമയക്രമം", pa: "ਸਮਾਂ-ਸਾਰਣੀ", ur: "نظام الاوقات", es: "Horario", fr: "Calendrier", pt: "Cronograma", ar: "الجدول الزمني", zh: "日程" } },
  "sec.people": { core: CORE, t: { en: "People and who appointed whom", hi: "लोग और किसने किसे नियुक्त किया", mr: "व्यक्ती आणि कोणी कोणाची नेमणूक केली", bn: "ব্যক্তি ও কে কাকে নিয়োগ করেছেন", ta: "நபர்கள், யார் யாரை நியமித்தனர்", te: "వ్యక్తులు, ఎవరు ఎవరిని నియమించారు", gu: "વ્યક્તિઓ અને કોણે કોને નિયુક્ત કર્યા", kn: "ವ್ಯಕ್ತಿಗಳು ಮತ್ತು ಯಾರು ಯಾರನ್ನು ನೇಮಿಸಿದರು", ml: "ആളുകളും ആരെ ആര് നിയമിച്ചു", pa: "ਲੋਕ ਅਤੇ ਕਿਸ ਨੇ ਕਿਸ ਨੂੰ ਨਿਯੁਕਤ ਕੀਤਾ", ur: "افراد اور کس نے کس کو مقرر کیا", es: "Personas y quién nombró a quién", fr: "Personnes et qui a nommé qui", pt: "Pessoas e quem nomeou quem", ar: "الأشخاص ومن عيّن من", zh: "人员及任命关系" } },
  "sec.options": { t: { en: "Options used", hi: "चुने गए विकल्प" } },
  "sec.rules": { core: CORE, t: { en: "Rules", hi: "नियम", mr: "नियम", bn: "নিয়ম", ta: "விதிகள்", te: "నియమాలు", gu: "નિયમો", kn: "ನಿಯಮಗಳು", ml: "നിയമങ്ങൾ", pa: "ਨਿਯਮ", ur: "قواعد", es: "Reglas", fr: "Règles", pt: "Regras", ar: "القواعد", zh: "规则" } },
  "sec.checks": { t: { en: "Checked against the rules", hi: "नियमों से जाँचा गया" } },
  "sec.notice": { t: { en: "Notice", hi: "सूचना" } },
  "sec.attendance": { core: CORE, t: { en: "Attendance and quorum", hi: "उपस्थिति और कोरम", mr: "उपस्थिती आणि गणपूर्ती", bn: "উপস্থিতি ও কোরাম", ta: "வருகை மற்றும் கோரம்", te: "హాజరు మరియు కోరం", gu: "હાજરી અને કોરમ", kn: "ಹಾಜರಾತಿ ಮತ್ತು ಕೋರಂ", ml: "ഹാജരും കോറവും", pa: "ਹਾਜ਼ਰੀ ਅਤੇ ਕੋਰਮ", ur: "حاضری اور کورم", es: "Asistencia y quórum", fr: "Présence et quorum", pt: "Presença e quórum", ar: "الحضور والنصاب", zh: "出席与法定人数" } },
  "sec.agenda": { core: CORE, t: { en: "Agenda and results", hi: "एजेंडा और परिणाम", mr: "कार्यसूची आणि निकाल", bn: "আলোচ্যসূচি ও ফলাফল", ta: "நிகழ்ச்சி நிரலும் முடிவுகளும்", te: "అజెండా మరియు ఫలితాలు", gu: "કાર્યસૂચિ અને પરિણામો", kn: "ಕಾರ್ಯಸೂಚಿ ಮತ್ತು ಫಲಿತಾಂಶ", ml: "അജണ്ടയും ഫലങ്ങളും", pa: "ਏਜੰਡਾ ਅਤੇ ਨਤੀਜੇ", ur: "ایجنڈا اور نتائج", es: "Orden del día y resultados", fr: "Ordre du jour et résultats", pt: "Pauta e resultados", ar: "جدول الأعمال والنتائج", zh: "议程与结果" } },
  "sec.payment": { t: { en: "Payment", hi: "भुगतान" } },
  "sec.access": { t: { en: "Access trail and terms", hi: "पहुँच का रिकॉर्ड और शर्तें" } },
  "sec.log": { core: CORE, t: { en: "Complete log", hi: "पूरा लॉग", mr: "संपूर्ण नोंदवही", bn: "সম্পূর্ণ লগ", ta: "முழு பதிவு", te: "పూర్తి లాగ్", gu: "સંપૂર્ણ લોગ", kn: "ಸಂಪೂರ್ಣ ಲಾಗ್", ml: "പൂർണ്ണ ലോഗ്", pa: "ਪੂਰਾ ਲੌਗ", ur: "مکمل لاگ", es: "Registro completo", fr: "Journal complet", pt: "Registo completo", ar: "السجل الكامل", zh: "完整日志" } },
  "sec.notpub": { t: { en: "What is not published and why", hi: "क्या प्रकाशित नहीं होता और क्यों" } },
  "btn.verify": { core: CORE, t: { en: "Verify", hi: "जाँचें", mr: "पडताळा", bn: "যাচাই করুন", ta: "சரிபார்", te: "ధృవీకరించు", gu: "ચકાસો", kn: "ಪರಿಶೀಲಿಸಿ", ml: "പരിശോധിക്കുക", pa: "ਜਾਂਚੋ", ur: "تصدیق کریں", es: "Verificar", fr: "Vérifier", pt: "Verificar", ar: "تحقق", zh: "验证" } },
  "btn.pdf": { core: CORE, t: { en: "Download PDF", hi: "पीडीएफ़ डाउनलोड करें", mr: "पीडीएफ डाउनलोड करा", bn: "পিডিএফ ডাউনলোড", ta: "பிடிஎஃப் பதிவிறக்கு", te: "పిడిఎఫ్ డౌన్‌లోడ్", gu: "પીડીએફ ડાઉનલોડ", kn: "ಪಿಡಿಎಫ್ ಡೌನ್‌ಲೋಡ್", ml: "പിഡിഎഫ് ഡൗൺലോഡ്", pa: "ਪੀਡੀਐਫ਼ ਡਾਊਨਲੋਡ", ur: "پی ڈی ایف ڈاؤن لوڈ", es: "Descargar PDF", fr: "Télécharger le PDF", pt: "Transferir PDF", ar: "تنزيل PDF", zh: "下载 PDF" } },
  "btn.save": { core: CORE, t: { en: "Save this page", hi: "यह पृष्ठ सहेजें", mr: "हे पान जतन करा", bn: "এই পাতা সংরক্ষণ", ta: "இந்தப் பக்கத்தைச் சேமி", te: "ఈ పేజీని సేవ్ చేయి", gu: "આ પાનું સાચવો", kn: "ಈ ಪುಟವನ್ನು ಉಳಿಸಿ", ml: "ഈ പേജ് സേവ് ചെയ്യുക", pa: "ਇਹ ਪੰਨਾ ਸੰਭਾਲੋ", ur: "یہ صفحہ محفوظ کریں", es: "Guardar esta página", fr: "Enregistrer cette page", pt: "Guardar esta página", ar: "احفظ هذه الصفحة", zh: "保存此页" } },
  "phase.setup": { core: CORE, t: { en: "Notice", hi: "सूचना", mr: "सूचना", bn: "নোটিশ", ta: "அறிவிப்பு", te: "నోటీసు", gu: "સૂચના", kn: "ಸೂಚನೆ", ml: "നോട്ടീസ്", pa: "ਸੂਚਨਾ", ur: "نوٹس", es: "Aviso", fr: "Avis", pt: "Aviso", ar: "إشعار", zh: "通知" } },
  "phase.ready": { core: CORE, t: { en: "Check-in", hi: "उपस्थिति", mr: "हजेरी", bn: "হাজিরা", ta: "வருகைப் பதிவு", te: "హాజరు నమోదు", gu: "હાજરી", kn: "ಹಾಜರಿ", ml: "ഹാജർ", pa: "ਹਾਜ਼ਰੀ", ur: "حاضری", es: "Registro", fr: "Accueil", pt: "Registo", ar: "تسجيل الحضور", zh: "签到" } },
  "phase.voting_day": { core: CORE, t: { en: "Voting", hi: "मतदान", mr: "मतदान", bn: "ভোটগ্রহণ", ta: "வாக்களிப்பு", te: "ఓటింగ్", gu: "મતદાન", kn: "ಮತದಾನ", ml: "വോട്ടെടുപ്പ്", pa: "ਵੋਟਿੰਗ", ur: "ووٹنگ", es: "Votación", fr: "Vote", pt: "Votação", ar: "التصويت", zh: "投票" } },
  "phase.report": { core: CORE, t: { en: "Report", hi: "रिपोर्ट", mr: "अहवाल", bn: "প্রতিবেদন", ta: "அறிக்கை", te: "నివేదిక", gu: "અહેવાલ", kn: "ವರದಿ", ml: "റിപ്പോർട്ട്", pa: "ਰਿਪੋਰਟ", ur: "رپورٹ", es: "Informe", fr: "Rapport", pt: "Relatório", ar: "التقرير", zh: "报告" } },
  "word.yes": { core: CORE, t: { en: "yes", hi: "हाँ", mr: "होय", bn: "হ্যাঁ", ta: "ஆம்", te: "అవును", gu: "હા", kn: "ಹೌದು", ml: "അതെ", pa: "ਹਾਂ", ur: "ہاں", es: "sí", fr: "oui", pt: "sim", ar: "نعم", zh: "是" } },
  "word.no": { core: CORE, t: { en: "no", hi: "नहीं", mr: "नाही", bn: "না", ta: "இல்லை", te: "కాదు", gu: "ના", kn: "ಇಲ್ಲ", ml: "ഇല്ല", pa: "ਨਹੀਂ", ur: "نہیں", es: "no", fr: "non", pt: "não", ar: "لا", zh: "否" } },
  "step.next": { core: CORE, t: { en: "Next step", hi: "अगला कदम", mr: "पुढील पायरी", bn: "পরের ধাপ", ta: "அடுத்த படி", te: "తదుపరి దశ", gu: "આગળનું પગલું", kn: "ಮುಂದಿನ ಹಂತ", ml: "അടുത്ത ഘട്ടം", pa: "ਅਗਲਾ ਕਦਮ", ur: "اگلا قدم", es: "Siguiente paso", fr: "Étape suivante", pt: "Próximo passo", ar: "الخطوة التالية", zh: "下一步" } },
  "th.option": { t: { en: "Option", hi: "विकल्प" } },
  "th.ticked": { t: { en: "Ticked = yes", hi: "टिक = हाँ" } },
  "th.notTicked": { t: { en: "Not ticked = no", hi: "टिक नहीं = नहीं" } },
  "th.weight": { t: { en: "Weight", hi: "भार" } },
  "th.votePct": { t: { en: "Vote %", hi: "मत %" } },
  "th.flat": { t: { en: "Flat", hi: "फ्लैट" } },
  "th.day": { t: { en: "Day", hi: "दिन" } },
  "th.date": { t: { en: "Date", hi: "तारीख" } },
  "th.time": { t: { en: "Time", hi: "समय" } },
  "th.place": { t: { en: "Place", hi: "स्थान" } },
  "status.pass": { t: { en: "pass", hi: "सफल" } },
  "status.fail": { t: { en: "FAIL", hi: "विफल" } },
  "status.info": { t: { en: "info", hi: "जानकारी" } },
  "status.open": { t: { en: "VOTING OPEN", hi: "मतदान चालू" } },
  "status.closed": { t: { en: "Closed", hi: "बंद" } },
  "status.pending": { t: { en: "Not opened yet", hi: "अभी खुला नहीं" } },
  "note.privacy": { t: { en: "Personal details on this page are partly hidden with * to protect privacy.", hi: "इस पृष्ठ पर व्यक्तिगत जानकारी गोपनीयता के लिए * से आंशिक रूप से छिपाई गई है।" } },
  "note.liveBanner": { t: { en: "This page updates by itself. When the event closes, this same page becomes the final signed report.", hi: "यह पृष्ठ अपने आप अपडेट होता है। कार्यक्रम बंद होने पर यही पृष्ठ अंतिम हस्ताक्षरित रिपोर्ट बन जाता है।" } },
  "note.finalBanner": { t: { en: "Signed and sealed. Anyone may save this page. It cannot be edited without being detected.", hi: "हस्ताक्षरित और मुहरबंद। कोई भी यह पृष्ठ सहेज सकता है। इसे बदला गया तो पता चल जाएगा।" } },
  "note.ended": { t: { en: "This event has ended.", hi: "यह कार्यक्रम समाप्त हो गया है।" } },
  "msg.verifyOk": { t: { en: "Verified: every entry links, every signature is valid and all figures match the log.", hi: "सत्यापित: हर प्रविष्टि जुड़ी है, हर हस्ताक्षर सही है और सभी आँकड़े लॉग से मेल खाते हैं।" } },
  "msg.verifyBad": { t: { en: "NOT VERIFIED", hi: "सत्यापित नहीं" } },
};

export const CATALOG_KEYS = Object.keys(CAT);
export const CORE_KEYS = CATALOG_KEYS.filter((k) => CAT[k]!.core);

/** Text for a key in a language; falls back to English, then to the key itself. {name} placeholders are replaced from vars. */
export function t(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  const e = CAT[key]; const s = e?.t[lang] ?? e?.t.en ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
/** Whole dictionary for a language (missing keys filled from English). */
export function dictionary(lang: string): Record<string, string> {
  const out: Record<string, string> = {}; for (const k of CATALOG_KEYS) out[k] = CAT[k]!.t[lang] ?? CAT[k]!.t.en!; return out;
}
export function coverage(): Array<{ code: string; keys: number; of: number; percent: number; status: string }> {
  return LANGUAGES.map((l) => { const n = CATALOG_KEYS.filter((k) => CAT[k]!.t[l.code] !== undefined).length; return { code: l.code, keys: n, of: CATALOG_KEYS.length, percent: Math.round((n * 100) / CATALOG_KEYS.length), status: l.status }; });
}

import { LANGUAGES, translate } from './i18n.js';
import { screeningMessages } from './screening-messages.js';

const appMessages = {
  hi: {
    'Nutri-Scan farmer dashboard': 'Nutri-Scan किसान डैशबोर्ड',
    'Welcome to Nutri-Scan': 'Nutri-Scan में आपका स्वागत है',
    'Detailed dashboard': 'विस्तृत डैशबोर्ड',
    'Farmer mode': 'किसान मोड',
    'Account and farm members': 'खाता और फार्म के सदस्य',
    'Farm fieldwork': 'फार्म के कार्य',
    'Batches, observations, reminders and testing help': 'बैच, अवलोकन, अनुस्मारक और जांच सहायता',
    'Start fresh readings for this batch? Unsaved form readings will be cleared.': 'इस बैच के लिए नई रीडिंग शुरू करें? फ़ॉर्म की बिना सहेजी रीडिंग हट जाएंगी।',
    'Go to screening': 'प्रारंभिक जांच पर जाएं',
    'Open saved readings and sync': 'सहेजी गई रीडिंग खोलें और सिंक करें',
    'You are offline. Save complete readings in drafts and sync when online.': 'आप ऑफ़लाइन हैं। पूरी रीडिंग मसौदे में सहेजें और ऑनलाइन होने पर सिंक करें।',
  },
  mr: {
    'Nutri-Scan farmer dashboard': 'Nutri-Scan शेतकरी डॅशबोर्ड',
    'Welcome to Nutri-Scan': 'Nutri-Scan मध्ये आपले स्वागत आहे',
    'Detailed dashboard': 'सविस्तर डॅशबोर्ड',
    'Farmer mode': 'शेतकरी मोड',
    'Account and farm members': 'खाते आणि फार्मचे सदस्य',
    'Farm fieldwork': 'फार्मची कामे',
    'Batches, observations, reminders and testing help': 'बॅच, निरीक्षणे, स्मरणपत्रे आणि तपासणी मदत',
    'Start fresh readings for this batch? Unsaved form readings will be cleared.': 'या बॅचसाठी नवीन मोजमापे सुरू करायची? फॉर्ममधील न जतन केलेली मोजमापे काढली जातील.',
    'Go to screening': 'प्राथमिक तपासणीकडे जा',
    'Open saved readings and sync': 'जतन केलेली मोजमापे उघडा आणि सिंक करा',
    'You are offline. Save complete readings in drafts and sync when online.': 'आपण ऑफलाइन आहात. पूर्ण मोजमापे मसुद्यात जतन करा आणि ऑनलाइन झाल्यावर सिंक करा.',
  },
};

export const farmerDictionaries = Object.freeze(Object.fromEntries(['hi', 'mr'].map((locale) => [
  locale,
  Object.freeze(Object.assign({}, screeningMessages[locale], appMessages[locale])),
])));

/** Shared screening/app copy. Lazy feature panels supply their own supplemental catalogs. */
export function createFarmerTranslator(selectedLocale = 'en') {
  const locale = LANGUAGES.some(({ code }) => code === selectedLocale) ? selectedLocale : 'en';
  const dictionary = farmerDictionaries[locale] || {};
  return Object.assign((key, values = {}) => {
    if (!Object.hasOwn(dictionary, key)) return translate(locale, key, values);
    return dictionary[key].replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (placeholder, name) => (
      values != null && Object.hasOwn(values, name) && values[name] != null ? String(values[name]) : placeholder
    ));
  }, { locale });
}

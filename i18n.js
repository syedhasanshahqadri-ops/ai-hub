/* Small UI dictionary for the main surfaces. Chat replies are handled by the backend. */
(function () {
  var D = {
    en: {
      newChat: "New chat", search: "Search chats", placeholder: "Message AI HUB",
      welcomeTitle: "What are we working on?",
      welcomeSub: "Ask anything in English, Urdu, Roman Urdu or Hindi.",
      cLearn: "Learn something", cLearnSub: "Explain any topic simply",
      cMcq: "Practice MCQs", cMcqSub: "Questions with answers",
      cCode: "Write or debug code", cCodeSub: "Build or fix something",
      cImage: "Create an image", cImageSub: "Describe it, get a picture",
      hint: "Enter to send · Shift+Enter for a new line"
    },
    ur: {
      newChat: "نئی چیٹ", search: "چیٹس تلاش کریں", placeholder: "AI HUB کو پیغام لکھیں",
      welcomeTitle: "آج کس پر کام کریں؟",
      welcomeSub: "اردو، رومن اردو، ہندی یا انگریزی میں کچھ بھی پوچھیں۔",
      cLearn: "کچھ سیکھیں", cLearnSub: "کوئی بھی موضوع آسان زبان میں",
      cMcq: "MCQs کی مشق", cMcqSub: "جوابات کے ساتھ سوالات",
      cCode: "کوڈ لکھیں یا ٹھیک کریں", cCodeSub: "کچھ بنائیں یا درست کریں",
      cImage: "تصویر بنائیں", cImageSub: "بیان کریں، تصویر پائیں",
      hint: "بھیجنے کے لیے Enter دبائیں"
    },
    roman: {
      newChat: "Nayi chat", search: "Chats talash karein", placeholder: "AI HUB ko message likhein",
      welcomeTitle: "Aaj kis cheez par kaam karein?",
      welcomeSub: "Urdu, Roman Urdu, Hindi ya English mein kuch bhi poochein.",
      cLearn: "Kuch seekhein", cLearnSub: "Koi bhi topic asaan zubaan mein",
      cMcq: "MCQs ki practice", cMcqSub: "Jawabat ke saath sawalat",
      cCode: "Code likhein ya theek karein", cCodeSub: "Kuch banayein ya fix karein",
      cImage: "Image banayein", cImageSub: "Likhein, tasveer payein",
      hint: "Bhejne ke liye Enter dabayein"
    },
    hi: {
      newChat: "नई चैट", search: "चैट खोजें", placeholder: "AI HUB को संदेश लिखें",
      welcomeTitle: "आज किस पर काम करें?",
      welcomeSub: "हिंदी, उर्दू, रोमन उर्दू या अंग्रेज़ी में कुछ भी पूछिए।",
      cLearn: "कुछ सीखें", cLearnSub: "कोई भी विषय आसान भाषा में",
      cMcq: "MCQ अभ्यास", cMcqSub: "उत्तर सहित प्रश्न",
      cCode: "कोड लिखें या ठीक करें", cCodeSub: "कुछ बनाएँ या सुधारें",
      cImage: "तस्वीर बनाएँ", cImageSub: "बताइए, तस्वीर पाइए",
      hint: "भेजने के लिए Enter दबाएँ"
    }
  };
  function pick(lang) { return D[lang] || D.en; }
  window.AIHubI18n = {
    t: function (lang, key) { return (pick(lang)[key]) || D.en[key] || key; },
    apply: function (lang) {
      var d = pick(lang);
      document.querySelectorAll("[data-i18n]").forEach(function (el) {
        var k = el.getAttribute("data-i18n"); if (d[k]) el.textContent = d[k];
      });
      document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
        var k = el.getAttribute("data-i18n-ph"); if (d[k]) el.setAttribute("placeholder", d[k]);
      });
      var hint = document.getElementById("sendHint");
      if (hint) hint.textContent = d.hint;
      var w = document.getElementById("welcome");
      if (w) {
        w.classList.toggle("ur", lang === "ur");
        w.classList.toggle("hi", lang === "hi");
        w.setAttribute("dir", lang === "ur" ? "rtl" : "ltr");
      }
    }
  };
})();

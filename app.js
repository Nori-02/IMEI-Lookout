const i18n = {
  ar: {
    site_title: "الإبلاغ عن هاتف مفقود/مسروق",
    report_title: "تقديم بلاغ",
    imei_label: "رقم IMEI (15 رقمًا)",
    imei_hint: "يمكنك إيجاده عبر *#06#",
    status_label: "الحالة",
    status_lost: "مفقود",
    status_stolen: "مسروق",
    brand_label: "العلامة",
    model_label: "الطراز",
    color_label: "اللون",
    date_label: "تاريخ/وقت الفقد",
    location_label: "الموقع التقريبي",
    desc_label: "وصف إضافي",
    contact_name_label: "الاسم",
    contact_email_label: "البريد الإلكتروني",
    contact_phone_label: "الهاتف",
    police_label: "رقم محضر الشرطة (اختياري)",
    public_label: "السماح بعرض هذا البلاغ للعامة",
    submit_btn: "إرسال البلاغ",
    check_title: "فحص حالة جهاز",
    check_label: "أدخل رقم IMEI",
    check_btn: "فحص",
    footer_note: "نصيحة: بلّغ الشرطة ومزوّد الخدمة أيضًا لتعطيل الجهاز.",
    success_ref: (r) => `تم استلام البلاغ. رقم المرجع: ${r}`,
    invalid_imei: "رقم IMEI غير صالح",
    server_error: "حدث خطأ. حاول لاحقًا.",
    results_found: (n) => n > 0 ? `تم العثور على ${n} بلاغ(ات) لهذا IMEI.` : "لا توجد بلاغات علنية لهذا IMEI."
  },
  en: {
    site_title: "Report Lost/Stolen Phone",
    report_title: "Submit a Report",
    imei_label: "IMEI (15 digits)",
    imei_hint: "Find it via *#06#",
    status_label: "Status",
    status_lost: "Lost",
    status_stolen: "Stolen",
    brand_label: "Brand",
    model_label: "Model",
    color_label: "Color",
    date_label: "Lost date/time",
    location_label: "Approximate location",
    desc_label: "Additional description",
    contact_name_label: "Name",
    contact_email_label: "Email",
    contact_phone_label: "Phone",
    police_label: "Police report number (optional)",
    public_label: "Allow this report to be public",
    submit_btn: "Submit report",
    check_title: "Check device status",
    check_label: "Enter IMEI",
    check_btn: "Check",
    footer_note: "Tip: Also notify police and your carrier to disable the device.",
    success_ref: (r) => `Report received. Reference: ${r}`,
    invalid_imei: "Invalid IMEI number",
    server_error: "An error occurred. Please try again.",
    results_found: (n) => n > 0 ? `${n} report(s) found for this IMEI.` : "No public reports for this IMEI."
  }
};

document.getElementById("toggleDark").addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
});

reportMsg.textContent = i18n[state.lang].success_ref(json.ref);
setTimeout(() => window.location.href = "/thankyou.html", 2000);

const state = {
  lang: localStorage.getItem("lang") || "ar",
  apiBase: "" // same origin
};

const setLang = (lang) => {
  state.lang = lang;
  localStorage.setItem("lang", lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const val = i18n[lang][key];
    if (typeof val === "string") el.textContent = val;
  });

  // Update select options text
  document.querySelectorAll("option[data-i18n]").forEach(opt => {
    const key = opt.getAttribute("data-i18n");
    const val = i18n[lang][key];
    if (typeof val === "string") opt.textContent = val;
  });

  document.getElementById("lang-ar").classList.toggle("active", lang === "ar");
  document.getElementById("lang-en").classList.toggle("active", lang === "en");
};

const luhnIMEI = (s) => {
  if (!/^\d{15}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(s[i], 10);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};

// Init
window.addEventListener("DOMContentLoaded", () => {
  setLang(state.lang);

  document.getElementById("lang-ar").addEventListener("click", () => setLang("ar"));
  document.getElementById("lang-en").addEventListener("click", () => setLang("en"));

  const reportForm = document.getElementById("reportForm");
  const reportMsg = document.getElementById("reportMsg");
  reportForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    reportMsg.className = "msg";
    reportMsg.textContent = "";

    const data = {
      imei: reportForm.imei.value.trim(),
      status: reportForm.status.value,
      brand: reportForm.brand.value.trim(),
      model: reportForm.model.value.trim(),
      color: reportForm.color.value.trim(),
      description: reportForm.description.value.trim(),
      lost_date: reportForm.lost_date.value || null,
      location: reportForm.location.value.trim(),
      contact_name: reportForm.contact_name.value.trim(),
      contact_email: reportForm.contact_email.value.trim(),
      contact_phone: reportForm.contact_phone.value.trim(),
      police_report: reportForm.police_report.value.trim(),
      is_public: reportForm.is_public.checked ? 1 : 0
    };

    if (!luhnIMEI(data.imei)) {
      reportMsg.classList.add("error");
      reportMsg.textContent = i18n[state.lang].invalid_imei;
      return;
    }

    try {
      const res = await fetch(`${state.apiBase}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "err");
      reportMsg.classList.add("success");
      reportMsg.textContent = i18n[state.lang].success_ref(json.ref);
      reportForm.reset();
    } catch (err) {
      reportMsg.classList.add("error");
      reportMsg.textContent = i18n[state.lang].server_error;
    }
  });

  const checkForm = document.getElementById("checkForm");
  const checkResult = document.getElementById("checkResult");
  checkForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    checkResult.className = "msg";
    checkResult.textContent = "";

    const imei = document.getElementById("checkImei").value.trim();
    if (!luhnIMEI(imei)) {
      checkResult.classList.add("error");
      checkResult.textContent = i18n[state.lang].invalid_imei;
      return;
    }

    try {
      const res = await fetch(`${state.apiBase}/api/check?imei=${encodeURIComponent(imei)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "err");
      checkResult.classList.add("success");
      const n = json.count || 0;
      let text = i18n[state.lang].results_found(n);
      if (n > 0) {
        const items = json.reports.map(r => {
          const parts = [
            r.status.toUpperCase(),
            [r.brand, r.model].filter(Boolean).join(" "),
            r.color || "",
            r.lost_date || "",
            r.location || ""
          ].filter(Boolean).join(" • ");
          return `- ${parts}`;
        }).join("\n");
        text += "\n" + items;
      }
      checkResult.textContent = text;
    } catch (err) {
      checkResult.classList.add("error");
      checkResult.textContent = i18n[state.lang].server_error;
    }
  });
});

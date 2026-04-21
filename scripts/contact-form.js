(function () {
  const PUBLIC_KEY = "dK8AbmjPehDjvVGHk";
  const SERVICE_ID = "wtt_email_service";
  const TEMPLATE_ID = "contact_us_template";

  const form = document.getElementById("contact-form");
  const statusEl = document.getElementById("form-status");

  if (!form || !window.emailjs) return;

  emailjs.init({
    publicKey: PUBLIC_KEY,
  });

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", isError);
    statusEl.classList.toggle("is-success", !isError && message !== "");
  }

  function validateForm() {
    const name = form.elements["name"]?.value.trim();
    const email = form.elements["email"]?.value.trim();
    const subject = form.elements["subject"]?.value.trim();
    const message = form.elements["message"]?.value.trim();

    if (!name || !email || !subject || !message) {
      setStatus("Please fill out all fields.", true);
      return false;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setStatus("Please enter a valid email address.", true);
      return false;
    }

    return true;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!validateForm()) return;

    const submitButton = form.querySelector(".form-submit");
    const originalText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Sending…";
    setStatus("");

    try {
      await emailjs.sendForm(SERVICE_ID, TEMPLATE_ID, form);
      form.reset();
      setStatus("Message sent.");
    } catch (error) {
      console.error("EmailJS error:", error);
      setStatus("Message failed to send. Please try again.", true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
})();
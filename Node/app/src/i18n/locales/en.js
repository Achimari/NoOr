export default {
  header: {
    logoTitle: "NoOr",
    logoSubtitle: "",
    languageLabel: "Language",
    languages: { ru: "RU", en: "EN" },
    nav: [
      { label: "Home", to: "/" },
      { label: "Prayer needs", to: "/prayer-needs" },
      { label: "Info", to: "/info" }
    ]
  },
  footer: {
    copyright: "",
    socialAria: "Social links"
  },
  home: {
    hero: {
      kicker: "",
      title: "NoOr",
      subtitle: "",
      ctaFirst: "",
      ctaSecond: "",
      inviteMain: "",
      inviteSub: ""
    },
    firstVisit: { title: "", text: "", cards: [] },
    visitFlow: { title: "", text: "", steps: [] },
    verse: { text: "", reference: "" },
    useful: { title: "", subtitle: "", links: [] }
  },
  about: { title: "", subtitle: "", roadmap: [] },
  prayerNeeds: { title: "Prayer needs", subtitle: "", items: [] },
  info: { title: "Info", subtitle: "", items: [] },
  auth: {
    login: {
      title: "Login",
      subtitle: "",
      loginLabel: "Login",
      passwordLabel: "Password",
      submit: "Sign in",
      onboardingLink: "Create account"
    },
    onboarding: {
      title: "Onboarding",
      subtitle: "",
      nameLabel: "Name",
      passwordLabel: "Password",
      confirmPasswordLabel: "Confirm password",
      submit: "Create account",
      loginLink: "Sign in"
    }
  },
  notFound: { title: "404", text: "", home: "" }
};

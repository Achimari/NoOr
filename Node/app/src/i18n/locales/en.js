export default {
  header: {
    logoTitle: "NoOr",
    logoSubtitle: "",
    languageLabel: "Language",
    languages: { ru: "RU", en: "EN" },
    nav: [
      { label: "Daily Check-in", to: "/daily-check-in" },
      { label: "Statistics", to: "/statistics" },
      { label: "My Prayers", to: "/my-prayers" },
      { label: "Community", to: "/community" }
    ]
  },
  footer: {
    copyright: "NoOr. All rights reserved.",
    tagline: "",
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
  dailyCheckIn: { title: "Daily Check-in", subtitle: "", items: [] },
  statistics: { title: "Statistics", subtitle: "", items: [] },
  myPrayers: { title: "My Prayer Requests", subtitle: "", items: [] },
  community: { title: "Community", subtitle: "", items: [] },
  auth: {
    login: {
      title: "Login",
      subtitle: "",
      loginLabel: "Login",
      passwordLabel: "Password",
      submit: "Log in",
      onboardingLink: "Create account"
    },
    onboarding: {
      title: "Onboarding",
      subtitle: "",
      nameLabel: "Name",
      passwordLabel: "Password",
      confirmPasswordLabel: "Confirm password",
      submit: "Create account",
      loginLink: "Log in"
    }
  },
  notFound: { title: "404", text: "", home: "" }
};

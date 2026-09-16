export default {
  localeTag: "en",
  theme: { system: "System", light: "Light", dark: "Dark" },
  header: {
    logoTitle: "Achimari",
    logoSubtitle: "",
    languageLabel: "Language",
    languages: { ru: "RU", en: "EN" },
    nav: [
      { label: "Today", to: "/daily-check-in" },
      { label: "Progress", to: "/statistics" },
      { label: "My Prayers", to: "/my-prayers" },
      { label: "Community", to: "/community" },
      { label: "Battle", to: "/battle" }
    ]
  },
  footer: {
    copyright: "Achimari. All rights reserved.",
    tagline: "",
    socialAria: "Social links"
  },
  about: {
    title: "About Achimari",
    subtitle: "Achimari turns three daily practices into a clear, honest record: recovery, Bible reading, and the tasks you choose to finish.",
    roadmap: [
      {
        title: "Answer Once a Day",
        text: "Record one honest Yes or No in your own time zone. Missed days wait for you on Today instead of disappearing."
      },
      {
        title: "Record What You Read",
        text: "Log the Bible passages you read and add a reflection if you wish. Reflections earn Wisdom and help unlock spells."
      },
      {
        title: "Plan up to Five Tasks",
        text: "Choose up to five tasks for the day and check them off as you finish. Completing every planned task builds your Tasks streak."
      },
      {
        title: "Pray Together",
        text: "Share a request, support other members, and mark your own prayer answered when the time comes."
      },
      {
        title: "See Your Progress",
        text: "Follow your streaks and answer patterns on Progress. Your daily record also shapes the character on My Profile."
      },
      {
        title: "Stay Reminded",
        text: "Connect Telegram to receive reminders and prayer lists without opening the site."
      }
    ]
  },
  dailyCheckIn: { title: "Daily Check-in", subtitle: "", items: [] },
  statistics: { title: "Statistics", subtitle: "", items: [] },
  myPrayers: { title: "My Prayer Requests", subtitle: "", items: [] },
  community: { title: "Community", subtitle: "", items: [] },
  auth: {
    login: {
      title: "Login",
      subtitle: "Return to your daily practice.",
      loginLabel: "Login",
      passwordLabel: "Password",
      submit: "Log in",
      onboardingLink: "Create account"
    },
    onboarding: {
      title: "Onboarding",
      subtitle: "Create your account and begin your daily record.",
      nameLabel: "Name",
      passwordLabel: "Password",
      passwordHint: "At least 8 characters.",
      confirmPasswordLabel: "Confirm password",
      submit: "Create account",
      loginLink: "Log in"
    }
  },
  notFound: {
    title: "404",
    text: "This page does not exist. It may have been renamed, or the link that brought you here may be out of date.",
    home: "Go to Daily Check-in"
  },

  /* English needs a catalogue entry only where the source string alone cannot
     say it: plurals. Everything else is shown exactly as the template wrote it. */
  messages: {
    "{count} days": { one: "{count} day", other: "{count} days" },
    "{count} users": { one: "{count} user", other: "{count} users" },
    "{count} items": { one: "{count} item", other: "{count} items" },
    "of {count} answers": { one: "of {count} answer", other: "of {count} answers" },
    "{count} points left": { one: "{count} point left", other: "{count} points left" },
    "{count} days now": { one: "{count} day now", other: "{count} days now" },
    "{count} days inactive": { one: "{count} day inactive", other: "{count} days inactive" },
    "{count} turns": { one: "{count} turn", other: "{count} turns" },
    "{count} activities left to complete.": { one: "{count} activity left to complete.", other: "{count} activities left to complete." },
    "{count} points too many": { one: "{count} point too many", other: "{count} points too many" }
  }
};

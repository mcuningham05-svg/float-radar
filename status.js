function getStatus(level, min, max) {
  if (level === null || !Number.isFinite(min) || !Number.isFinite(max)) {
    return {
      label: "No Data",
      text: "No live reading available",
      badgeClass: "status-none",
      bandClass: "none",
      emoji: "😐"
    };
  }

  if (level < min * 0.85) {
    return {
      label: "Low",
      text: "Low water — may be scrapey",
      badgeClass: "status-low",
      bandClass: "low",
      emoji: "☹️"
    };
  }

  if (level < min) {
    return {
      label: "Marginal",
      text: "Marginal — floatable in spots",
      badgeClass: "status-marginal",
      bandClass: "marginal",
      emoji: "🙂"
    };
  }

  const strongGoodThreshold = min + (max - min) * 0.55;

  if (level <= max) {
    return {
      label: level >= strongGoodThreshold ? "Great" : "Good",
      text: level >= strongGoodThreshold ? "Strong range — great float" : "In range — good float",
      badgeClass: "status-good",
      bandClass: "good",
      emoji: level >= strongGoodThreshold ? "😄" : "😊"
    };
  }

  if (level <= max * 1.3) {
    return {
      label: "High",
      text: "High water — fast current",
      badgeClass: "status-high",
      bandClass: "high",
      emoji: "😬"
    };
  }

  return {
    label: "Blown Out",
    text: "Very high — not recommended",
    badgeClass: "status-blown",
    bandClass: "blown",
    emoji: "😵"
  };
}

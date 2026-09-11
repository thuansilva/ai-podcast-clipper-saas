export function getProfileOptions(profile = "smoke") {
  switch (profile) {
    case "stress":
    case "spike":
      return {
        stages: [
          { duration: "15s", target: 50 },
          { duration: "1m", target: 150 },
          { duration: "15s", target: 200 },
          { duration: "30s", target: 0 },
        ],
      };
    case "load":
      return {
        stages: [
          { duration: "30s", target: 10 },
          { duration: "1m", target: 30 },
          { duration: "30s", target: 0 },
        ],
      };
    case "smoke":
    default:
      return {
        vus: 5,
        duration: "30s",
      };
  }
}

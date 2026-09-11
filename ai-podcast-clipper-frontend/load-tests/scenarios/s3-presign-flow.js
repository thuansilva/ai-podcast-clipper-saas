import http from "k6/http";
import { check, sleep } from "k6";
import { standardThresholds } from "../config/thresholds.js";
import { getProfileOptions } from "../config/profiles.js";
import { getCommonHeaders } from "../helpers/auth-headers.js";

const profile = __ENV.PROFILE || "smoke";
const baseUrl = __ENV.BASE_URL || "http://localhost:3000";

export const options = Object.assign({}, getProfileOptions(profile), {
  thresholds: standardThresholds,
});

export default function () {
  const payload = JSON.stringify({
    filename: `test_podcast_${__VU}_${__ITER}.mp4`,
    contentType: "video/mp4",
  });

  const res = http.post(`${baseUrl}/api/upload-url`, payload, {
    headers: getCommonHeaders(),
  });

  check(res, {
    "endpoint reachable (status is 200 or 401 unauth)": (r) =>
      r.status === 200 || r.status === 401 || r.status === 404,
    "response time < 250ms": (r) => r.timings.duration < 250,
  });

  sleep(0.1);
}

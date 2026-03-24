import { httpRouter } from "convex/server";
import { getCredential } from "./aicrendital";
import { publicaction } from "./secert";

const http = httpRouter();

http.route({
  path: "/verify-api-key",
  method: "POST",
  handler: publicaction,
});

// wee need to jsonify the response
http.route({
  path: "/credentials",
  method: "GET",
  handler: getCredential,
});

export default http; // <-- this is required

import assert from "node:assert/strict";
import test from "node:test";
import {
  followActionLabel,
  notificationActor,
  notificationMessage,
} from "../lib/social.ts";

test("labels public and private follow states clearly", () => {
  assert.equal(followActionLabel(null, false), "Follow");
  assert.equal(followActionLabel(null, true), "Request to follow");
  assert.equal(followActionLabel("pending", true), "Requested");
  assert.equal(followActionLabel("accepted", true), "Following");
});

test("describes every social notification type", () => {
  assert.equal(notificationMessage("follow_request", "Nikita"), "Nikita requested to follow you.");
  assert.equal(notificationMessage("follow_accepted", "Nikita"), "Nikita accepted your follow request.");
  assert.equal(notificationMessage("new_follower", "Nikita"), "Nikita followed you.");
});

test("normalizes nested notification actors", () => {
  const actor = { user_id: "1", username: "nikita" };
  assert.equal(notificationActor({ actor: [actor] }), actor);
  assert.equal(notificationActor({ actor }), actor);
  assert.equal(notificationActor({ actor: [] }), null);
});

import { describe, expect, it } from "vitest";
import { buildUserProfileFromAuthUser } from "../src/lib/user-profile.js";

describe("buildUserProfileFromAuthUser", () => {
  it("normalizes auth metadata into a valid user profile", () => {
    const profile = buildUserProfileFromAuthUser({
      id: "5d5b1d06-6b1f-4bc4-b0df-58b1d8a9d111",
      email: "jordan@example.com",
      user_metadata: {
        full_name: "Jordan Rivera",
        role: "manager",
        department: "Operations",
        skills: ["planning", "", "ops"],
        agent_enabled: false
      }
    });

    expect(profile).toEqual({
      id: "5d5b1d06-6b1f-4bc4-b0df-58b1d8a9d111",
      email: "jordan@example.com",
      full_name: "Jordan Rivera",
      role: "manager",
      department: "Operations",
      skills: ["planning", "ops"],
      agent_enabled: false
    });
  });

  it("falls back to worker defaults when auth metadata is incomplete", () => {
    const profile = buildUserProfileFromAuthUser({
      id: "c9c4d084-546d-4e37-9bc1-55a2c560e777",
      email: "worker@example.com",
      user_metadata: {
        role: "cto",
        department: ""
      }
    });

    expect(profile.full_name).toBe("worker");
    expect(profile.role).toBe("worker");
    expect(profile.department).toBeUndefined();
    expect(profile.skills).toBeUndefined();
    expect(profile.agent_enabled).toBe(true);
  });
});
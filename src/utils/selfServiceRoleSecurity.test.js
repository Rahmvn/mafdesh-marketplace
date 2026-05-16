import { describe, expect, it } from "vitest";
import {
  resolveImmutableSelfServiceRole,
  validateSelfServiceSignupInput,
} from "../../supabase/functions/_shared/selfServiceRoleSecurity.ts";

describe("resolveImmutableSelfServiceRole", () => {
  it("locks an existing buyer account even when seller is requested later", () => {
    expect(
      resolveImmutableSelfServiceRole({
        existingRole: "buyer",
        requestedRole: "seller",
        metadataRole: "seller",
        fallbackRole: "buyer",
      })
    ).toEqual({
      desiredRole: "buyer",
      storedRole: "buyer",
      roleLocked: true,
      isNewUser: false,
    });
  });

  it("locks an existing seller account even when buyer is requested later", () => {
    expect(
      resolveImmutableSelfServiceRole({
        existingRole: "seller",
        requestedRole: "buyer",
        metadataRole: "buyer",
      })
    ).toEqual({
      desiredRole: "seller",
      storedRole: "seller",
      roleLocked: true,
      isNewUser: false,
    });
  });

  it("keeps admin as the source of truth", () => {
    expect(
      resolveImmutableSelfServiceRole({
        existingRole: "admin",
        requestedRole: "seller",
        metadataRole: "buyer",
      })
    ).toEqual({
      desiredRole: "admin",
      storedRole: "admin",
      roleLocked: true,
      isNewUser: false,
    });
  });

  it("allows first-time valid seller bootstrap when no public user exists", () => {
    expect(
      resolveImmutableSelfServiceRole({
        existingRole: null,
        requestedRole: "seller",
        metadataRole: "buyer",
      })
    ).toEqual({
      desiredRole: "seller",
      storedRole: "",
      roleLocked: false,
      isNewUser: true,
    });
  });

  it("prefers the explicit request over conflicting auth metadata for first-time bootstrap", () => {
    expect(
      resolveImmutableSelfServiceRole({
        existingRole: null,
        requestedRole: "buyer",
        metadataRole: "seller",
        fallbackRole: "seller",
      })
    ).toEqual({
      desiredRole: "buyer",
      storedRole: "",
      roleLocked: false,
      isNewUser: true,
    });
  });
});

describe("validateSelfServiceSignupInput", () => {
  const baseSellerPayload = {
    role: "seller",
    fullName: "Jane Doe",
    phoneNumber: "08012345678",
    dateOfBirth: "1999-04-10",
    businessName: "Jane Store",
    location: "Lagos",
    universityName: "Mafdesh University",
    universityState: "Kaduna",
    universityZone: "North West",
  };

  it("accepts a valid first-time seller bootstrap payload", () => {
    expect(
      validateSelfServiceSignupInput(baseSellerPayload, { requireLocation: true })
    ).toBe("");
  });

  it("rejects forged seller bootstrap without seller fields", () => {
    expect(
      validateSelfServiceSignupInput(
        {
          ...baseSellerPayload,
          businessName: "",
          universityState: "",
          universityZone: "",
        },
        { requireLocation: true }
      )
    ).toBe("A valid business name is required for seller signup.");
  });
});

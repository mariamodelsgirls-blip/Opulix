import { describe, it, expect, beforeEach } from "vitest";

interface Certificate {
  itemId: string;
  owner: string;
  issuer: string;
  issuedAt: bigint;
  version: bigint;
  isRevoked: boolean;
  metadata: string;
}

interface VersionHistory {
  metadata: string;
  updatedAt: bigint;
  updatedBy: string;
}

interface MockContract {
  admin: string;
  paused: boolean;
  certificateCounter: bigint;
  certificates: Map<string, Certificate>;
  certificateVersions: Map<string, VersionHistory>;
  MAX_METADATA_LENGTH: number;
  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  issueCertificate(caller: string, itemId: string, owner: string, metadata: string): { value: bigint } | { error: number };
  updateMetadata(caller: string, certId: bigint, newMetadata: string): { value: bigint } | { error: number };
  revokeCertificate(caller: string, certId: bigint): { value: boolean } | { error: number };
  transferCertificate(caller: string, certId: bigint, newOwner: string): { value: boolean } | { error: number };
  verifyCertificate(certId: bigint, version: bigint): { value: boolean } | { error: number };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  certificateCounter: 0n,
  certificates: new Map<string, Certificate>(),
  certificateVersions: new Map<string, VersionHistory>(),
  MAX_METADATA_LENGTH: 256,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  issueCertificate(caller: string, itemId: string, owner: string, metadata: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (this.paused) return { error: 105 };
    if (owner === "SP000000000000000000002Q6VF78") return { error: 104 };
    if (metadata.length === 0 || metadata.length > this.MAX_METADATA_LENGTH) return { error: 106 };
    const certId = this.certificateCounter + 1n;
    if (this.certificates.has(certId.toString())) return { error: 103 };
    this.certificates.set(certId.toString(), {
      itemId,
      owner,
      issuer: caller,
      issuedAt: BigInt(1000), // Mock block height
      version: 1n,
      isRevoked: false,
      metadata,
    });
    this.certificateVersions.set(`${certId}:1`, {
      metadata,
      updatedAt: BigInt(1000),
      updatedBy: caller,
    });
    this.certificateCounter = certId;
    return { value: certId };
  },

  updateMetadata(caller: string, certId: bigint, newMetadata: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (this.paused) return { error: 105 };
    if (newMetadata.length === 0 || newMetadata.length > this.MAX_METADATA_LENGTH) return { error: 106 };
    const cert = this.certificates.get(certId.toString());
    if (!cert) return { error: 101 };
    if (cert.isRevoked) return { error: 102 };
    const newVersion = cert.version + 1n;
    this.certificates.set(certId.toString(), { ...cert, version: newVersion, metadata: newMetadata });
    this.certificateVersions.set(`${certId}:${newVersion}`, {
      metadata: newMetadata,
      updatedAt: BigInt(1001),
      updatedBy: caller,
    });
    return { value: newVersion };
  },

  revokeCertificate(caller: string, certId: bigint) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (this.paused) return { error: 105 };
    const cert = this.certificates.get(certId.toString());
    if (!cert) return { error: 101 };
    if (cert.isRevoked) return { error: 102 };
    this.certificates.set(certId.toString(), { ...cert, isRevoked: true });
    return { value: true };
  },

  transferCertificate(caller: string, certId: bigint, newOwner: string) {
    if (this.paused) return { error: 105 };
    if (newOwner === "SP000000000000000000002Q6VF78") return { error: 104 };
    const cert = this.certificates.get(certId.toString());
    if (!cert) return { error: 101 };
    if (cert.isRevoked) return { error: 102 };
    if (caller !== cert.owner) return { error: 100 };
    this.certificates.set(certId.toString(), { ...cert, owner: newOwner });
    return { value: true };
  },

  verifyCertificate(certId: bigint, version: bigint) {
    const cert = this.certificates.get(certId.toString());
    if (!cert) return { error: 101 };
    if (cert.isRevoked) return { error: 102 };
    if (cert.version !== version) return { error: 107 };
    return { value: true };
  },
};

describe("Opulix Authenticity Certificate Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.certificateCounter = 0n;
    mockContract.certificates = new Map();
    mockContract.certificateVersions = new Map();
  });

  it("should issue a new certificate when called by admin", () => {
    const result = mockContract.issueCertificate(
      mockContract.admin,
      "ITEM123",
      "ST2CY5...",
      "Luxury watch, serial #XYZ123"
    );
    expect(result).toEqual({ value: 1n });
    const cert = mockContract.certificates.get("1");
    expect(cert).toEqual({
      itemId: "ITEM123",
      owner: "ST2CY5...",
      issuer: mockContract.admin,
      issuedAt: 1000n,
      version: 1n,
      isRevoked: false,
      metadata: "Luxury watch, serial #XYZ123",
    });
    expect(mockContract.certificateVersions.get("1:1")).toEqual({
      metadata: "Luxury watch, serial #XYZ123",
      updatedAt: 1000n,
      updatedBy: mockContract.admin,
    });
  });

  it("should prevent non-admin from issuing certificates", () => {
    const result = mockContract.issueCertificate(
      "ST2CY5...",
      "ITEM123",
      "ST3NB...",
      "Luxury watch, serial #XYZ123"
    );
    expect(result).toEqual({ error: 100 });
  });

  it("should prevent issuing with invalid metadata", () => {
    const result = mockContract.issueCertificate(mockContract.admin, "ITEM123", "ST2CY5...", "");
    expect(result).toEqual({ error: 106 });
  });

  it("should update certificate metadata", () => {
    mockContract.issueCertificate(mockContract.admin, "ITEM123", "ST2CY5...", "Luxury watch, serial #XYZ123");
    const result = mockContract.updateMetadata(mockContract.admin, 1n, "Updated watch details");
    expect(result).toEqual({ value: 2n });
    const cert = mockContract.certificates.get("1");
    expect(cert?.metadata).toBe("Updated watch details");
    expect(cert?.version).toBe(2n);
    expect(mockContract.certificateVersions.get("1:2")).toEqual({
      metadata: "Updated watch details",
      updatedAt: 1001n,
      updatedBy: mockContract.admin,
    });
  });

  it("should prevent updating revoked certificate", () => {
    mockContract.issueCertificate(mockContract.admin, "ITEM123", "ST2CY5...", "Luxury watch, serial #XYZ123");
    mockContract.revokeCertificate(mockContract.admin, 1n);
    const result = mockContract.updateMetadata(mockContract.admin, 1n, "Updated watch details");
    expect(result).toEqual({ error: 102 });
  });

  it("should revoke a certificate", () => {
    mockContract.issueCertificate(mockContract.admin, "ITEM123", "ST2CY5...", "Luxury watch, serial #XYZ123");
    const result = mockContract.revokeCertificate(mockContract.admin, 1n);
    expect(result).toEqual({ value: true });
    const cert = mockContract.certificates.get("1");
    expect(cert?.isRevoked).toBe(true);
  });

  it("should transfer certificate ownership", () => {
    mockContract.issueCertificate(mockContract.admin, "ITEM123", "ST2CY5...", "Luxury watch, serial #XYZ123");
    const result = mockContract.transferCertificate("ST2CY5...", 1n, "ST3NB...");
    expect(result).toEqual({ value: true });
    const cert = mockContract.certificates.get("1");
    expect(cert?.owner).toBe("ST3NB...");
  });

  it("should prevent non-owner from transferring certificate", () => {
    mockContract.issueCertificate(mockContract.admin, "ITEM123", "ST2CY5...", "Luxury watch, serial #XYZ123");
    const result = mockContract.transferCertificate("ST3NB...", 1n, "ST4RE...");
    expect(result).toEqual({ error: 100 });
  });

  it("should verify a valid certificate", () => {
    mockContract.issueCertificate(mockContract.admin, "ITEM123", "ST2CY5...", "Luxury watch, serial #XYZ123");
    const result = mockContract.verifyCertificate(1n, 1n);
    expect(result).toEqual({ value: true });
  });

  it("should fail verification for wrong version", () => {
    mockContract.issueCertificate(mockContract.admin, "ITEM123", "ST2CY5...", "Luxury watch, serial #XYZ123");
    const result = mockContract.verifyCertificate(1n, 2n);
    expect(result).toEqual({ error: 107 });
  });
});
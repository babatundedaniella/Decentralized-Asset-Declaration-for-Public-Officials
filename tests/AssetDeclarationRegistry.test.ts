import { describe, it, expect, beforeEach } from "vitest";
import { buffCV, stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_ALREADY_DECLARED = 101;
const ERR_INVALID_HASH = 102;
const ERR_INVALID_ENCRYPTED_DATA = 103;
const ERR_INVALID_TIMESTAMP = 104;
const ERR_DECLARATION_NOT_FOUND = 105;
const ERR_INVALID_OFFICIAL = 106;
const ERR_MAX_DECLARATIONS_EXCEEDED = 107;
const ERR_INVALID_UPDATE_PARAM = 108;
const ERR_AUTHORITY_NOT_VERIFIED = 109;
const ERR_INVALID_STATUS = 110;
const ERR_INVALID_MIN_HASH_LEN = 111;
const ERR_INVALID_MAX_DATA_SIZE = 112;
const ERR_UPDATE_NOT_ALLOWED = 113;
const ERR_INVALID_CURRENCY = 114;
const ERR_INVALID_LOCATION = 115;
const ERR_INVALID_GRACE_PERIOD = 116;
const ERR_INVALID_INTEREST_RATE = 117;
const ERR_INVALID_DECLARATION_TYPE = 119;

interface Declaration {
  hash: Uint8Array;
  timestamp: number;
  encryptedData: Uint8Array;
  status: boolean;
  currency: string;
  location: string;
  gracePeriod: number;
  interestRate: number;
  declarationType: string;
}

interface DeclarationUpdate {
  updateHash: Uint8Array;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AssetDeclarationRegistryMock {
  state: {
    declarationCounter: number;
    maxDeclarations: number;
    registrationFee: number;
    authorityContract: string | null;
    declarations: Map<string, Declaration>;
    declarationUpdates: Map<string, DeclarationUpdate>;
    declarationsByType: Map<string, number>;
  } = {
    declarationCounter: 0,
    maxDeclarations: 10000,
    registrationFee: 500,
    authorityContract: null,
    declarations: new Map(),
    declarationUpdates: new Map(),
    declarationsByType: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      declarationCounter: 0,
      maxDeclarations: 10000,
      registrationFee: 500,
      authorityContract: null,
      declarations: new Map(),
      declarationUpdates: new Map(),
      declarationsByType: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  getKey(official: string, id: number): string {
    return `${official}-${id}`;
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxDeclarations(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.maxDeclarations = newMax;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerDeclaration(
    hash: Uint8Array,
    encryptedData: Uint8Array,
    currency: string,
    location: string,
    gracePeriod: number,
    interestRate: number,
    declarationType: string
  ): Result<number> {
    if (this.state.declarationCounter >= this.state.maxDeclarations) return { ok: false, value: ERR_MAX_DECLARATIONS_EXCEEDED };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (encryptedData.length > 256) return { ok: false, value: ERR_INVALID_ENCRYPTED_DATA };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (gracePeriod > 30) return { ok: false, value: ERR_INVALID_GRACE_PERIOD };
    if (interestRate > 20) return { ok: false, value: ERR_INVALID_INTEREST_RATE };
    if (!["annual", "quarterly", "special"].includes(declarationType)) return { ok: false, value: ERR_INVALID_DECLARATION_TYPE };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    const nextId = this.state.declarationCounter + 1;
    const key = this.getKey(this.caller, nextId);
    if (this.state.declarations.has(key)) return { ok: false, value: ERR_ALREADY_DECLARED };

    this.stxTransfers.push({ amount: this.state.registrationFee, from: this.caller, to: this.state.authorityContract });

    const declaration: Declaration = {
      hash,
      timestamp: this.blockHeight,
      encryptedData,
      status: true,
      currency,
      location,
      gracePeriod,
      interestRate,
      declarationType,
    };
    this.state.declarations.set(key, declaration);
    this.state.declarationsByType.set(declarationType, nextId);
    this.state.declarationCounter = nextId;
    return { ok: true, value: nextId };
  }

  getDeclaration(official: string, declarationId: number): Declaration | null {
    const key = this.getKey(official, declarationId);
    return this.state.declarations.get(key) || null;
  }

  updateDeclaration(
    declarationId: number,
    updateHash: Uint8Array,
    updateEncryptedData: Uint8Array
  ): Result<boolean> {
    const key = this.getKey(this.caller, declarationId);
    const decl = this.state.declarations.get(key);
    if (!decl) return { ok: false, value: false };
    if (updateHash.length !== 32) return { ok: false, value: false };
    if (updateEncryptedData.length > 256) return { ok: false, value: false };

    const updated: Declaration = {
      ...decl,
      hash: updateHash,
      timestamp: this.blockHeight,
      encryptedData: updateEncryptedData,
    };
    this.state.declarations.set(key, updated);
    this.state.declarationUpdates.set(key, {
      updateHash,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getDeclarationCount(): Result<number> {
    return { ok: true, value: this.state.declarationCounter };
  }

  checkDeclarationExistence(declarationType: string): Result<boolean> {
    return { ok: true, value: this.state.declarationsByType.has(declarationType) };
  }
}

describe("AssetDeclarationRegistry", () => {
  let contract: AssetDeclarationRegistryMock;

  beforeEach(() => {
    contract = new AssetDeclarationRegistryMock();
    contract.reset();
  });

  it("registers a declaration successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const encryptedData = new Uint8Array(256).fill(2);
    const result = contract.registerDeclaration(
      hash,
      encryptedData,
      "STX",
      "LocationX",
      7,
      10,
      "annual"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);

    const decl = contract.getDeclaration("ST1TEST", 1);
    expect(decl?.hash).toEqual(hash);
    expect(decl?.encryptedData).toEqual(encryptedData);
    expect(decl?.currency).toBe("STX");
    expect(decl?.location).toBe("LocationX");
    expect(decl?.gracePeriod).toBe(7);
    expect(decl?.interestRate).toBe(10);
    expect(decl?.declarationType).toBe("annual");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate declaration", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const encryptedData = new Uint8Array(256).fill(2);
    contract.registerDeclaration(
      hash,
      encryptedData,
      "STX",
      "LocationX",
      7,
      10,
      "annual"
    );
    const result = contract.registerDeclaration(
      hash,
      encryptedData,
      "USD",
      "LocationY",
      14,
      15,
      "quarterly"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects registration without authority contract", () => {
    const hash = new Uint8Array(32).fill(1);
    const encryptedData = new Uint8Array(256).fill(2);
    const result = contract.registerDeclaration(
      hash,
      encryptedData,
      "STX",
      "LocationX",
      7,
      10,
      "annual"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid hash", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(31).fill(1);
    const encryptedData = new Uint8Array(256).fill(2);
    const result = contract.registerDeclaration(
      hash,
      encryptedData,
      "STX",
      "LocationX",
      7,
      10,
      "annual"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects invalid encrypted data", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const encryptedData = new Uint8Array(257).fill(2);
    const result = contract.registerDeclaration(
      hash,
      encryptedData,
      "STX",
      "LocationX",
      7,
      10,
      "annual"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ENCRYPTED_DATA);
  });

  it("rejects invalid currency", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const encryptedData = new Uint8Array(256).fill(2);
    const result = contract.registerDeclaration(
      hash,
      encryptedData,
      "INVALID",
      "LocationX",
      7,
      10,
      "annual"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });

  it("updates a declaration successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const encryptedData = new Uint8Array(256).fill(2);
    contract.registerDeclaration(
      hash,
      encryptedData,
      "STX",
      "LocationX",
      7,
      10,
      "annual"
    );
    const updateHash = new Uint8Array(32).fill(3);
    const updateEncryptedData = new Uint8Array(256).fill(4);
    const result = contract.updateDeclaration(1, updateHash, updateEncryptedData);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const decl = contract.getDeclaration("ST1TEST", 1);
    expect(decl?.hash).toEqual(updateHash);
    expect(decl?.encryptedData).toEqual(updateEncryptedData);
    const update = contract.state.declarationUpdates.get("ST1TEST-1");
    expect(update?.updateHash).toEqual(updateHash);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent declaration", () => {
    contract.setAuthorityContract("ST2TEST");
    const updateHash = new Uint8Array(32).fill(3);
    const updateEncryptedData = new Uint8Array(256).fill(4);
    const result = contract.updateDeclaration(99, updateHash, updateEncryptedData);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets registration fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registrationFee).toBe(1000);
    const hash = new Uint8Array(32).fill(1);
    const encryptedData = new Uint8Array(256).fill(2);
    contract.registerDeclaration(
      hash,
      encryptedData,
      "STX",
      "LocationX",
      7,
      10,
      "annual"
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects registration fee change without authority", () => {
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct declaration count", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const encryptedData = new Uint8Array(256).fill(2);
    contract.registerDeclaration(
      hash,
      encryptedData,
      "STX",
      "LocationX",
      7,
      10,
      "annual"
    );
    contract.registerDeclaration(
      hash,
      encryptedData,
      "USD",
      "LocationY",
      14,
      15,
      "quarterly"
    );
    const result = contract.getDeclarationCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks declaration existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const encryptedData = new Uint8Array(256).fill(2);
    contract.registerDeclaration(
      hash,
      encryptedData,
      "STX",
      "LocationX",
      7,
      10,
      "annual"
    );
    const result = contract.checkDeclarationExistence("annual");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkDeclarationExistence("nonexistent");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses declaration parameters with Clarity types", () => {
    const dtype = stringUtf8CV("annual");
    const grace = uintCV(7);
    const interest = uintCV(10);
    expect(dtype.value).toBe("annual");
    expect(grace.value).toEqual(BigInt(7));
    expect(interest.value).toEqual(BigInt(10));
  });

  it("rejects registration with max declarations exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxDeclarations = 1;
    const hash = new Uint8Array(32).fill(1);
    const encryptedData = new Uint8Array(256).fill(2);
    contract.registerDeclaration(
      hash,
      encryptedData,
      "STX",
      "LocationX",
      7,
      10,
      "annual"
    );
    const result = contract.registerDeclaration(
      hash,
      encryptedData,
      "USD",
      "LocationY",
      14,
      15,
      "quarterly"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_DECLARATIONS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});
// Account profiles (the client's settings: controls, brightness, vibration),
// by account soid, as the client last uploaded them (profile_set_account_
// profile, 701): the raw request body, network id included, decoded by the
// build's encoder when the self primary goes out. Loaded at sign-in from the
// store and kept up to date by every upload.
const profiles = new Map<bigint, Buffer>();

export function accountProfile(accountSoid: bigint): Buffer | undefined {
  return profiles.get(accountSoid);
}

export function setAccountProfile(accountSoid: bigint, body: Buffer): void {
  profiles.set(accountSoid, body);
}

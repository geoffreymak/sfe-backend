export function randEmail() {
  return `user_${Date.now()}@test.local`;
}

export function rand() {
  return Math.floor(Math.random() * 1e6).toString(36);
}

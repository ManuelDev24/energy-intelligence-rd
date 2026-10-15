type Operation<T> = { write: () => Promise<unknown>; read: () => Promise<T>; check: () => void; publish: (value: T) => void };
export async function saveVerified<T>(operation: Operation<T>): Promise<T> {
  operation.check();
  await operation.write();
  operation.check();
  const value = await operation.read();
  operation.check();
  operation.publish(value);
  return value;
}

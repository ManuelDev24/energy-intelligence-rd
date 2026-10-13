// Auditoría C-10: verificación de correo de extremo a extremo (registro → correo real en la bandeja de pruebas → enlace → aviso desaparece).
import { expect, registerViaUi, test, waitForMail } from "../support/test";

const isVerification = (subject: string) => /confirma tu correo/i.test(subject);
const tokenOf = (text: string) => /#token=([A-Za-z0-9_-]{43})/.exec(text)![1];

test.describe("verificación de correo", () => {
  test("una cuenta nueva ve el aviso, el enlace del correo la confirma y el aviso desaparece", async ({ page }) => {
    const account = await registerViaUi(page);
    await expect(page.getByTestId("email-verification-notice")).toBeVisible();
    const mail = await waitForMail(account.email, isVerification);
    expect(mail.text).not.toContain("?token=");
    await page.goto(`/verificar-correo#token=${tokenOf(mail.text)}`);
    await expect(page.getByText(/correo quedó confirmado/i)).toBeVisible();
    expect(page.url()).not.toContain("token=");
    await page.getByRole("link", { name: "Ir a Energy RD" }).click();
    await page.waitForURL("**/homes");
    await expect(page.getByTestId("email-verification-notice")).toHaveCount(0);
    // un enlace usado no vale otra vez
    await page.goto(`/verificar-correo#token=${tokenOf(mail.text)}`);
    await expect(page.getByText(/no es válido o caducó/i)).toBeVisible();
  });

  test("reenviar el enlace manda un correo nuevo y deja sin efecto el anterior", async ({ page }) => {
    const account = await registerViaUi(page);
    const first = tokenOf((await waitForMail(account.email, isVerification)).text);
    await page.getByRole("button", { name: "Reenviar el enlace" }).click();
    await expect(page.getByText(/Te enviamos un enlace/)).toBeVisible();
    await expect.poll(async () => tokenOf((await waitForMail(account.email, isVerification)).text), { timeout: 20_000 }).not.toBe(first);
    await page.goto(`/verificar-correo#token=${first}`);
    await expect(page.getByText(/no es válido o caducó/i)).toBeVisible();
  });
});

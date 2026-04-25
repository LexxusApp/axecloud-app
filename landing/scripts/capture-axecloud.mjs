/**
 * 1) Telas públicas: login (desktop + “celular”)
 * 2) Se AXE_TEST_EMAIL e AXE_TEST_PASSWORD estiverem no ambiente:
 *    entra como zelador e captura os módulos (sidebar).
 *
 * `npm run dev` na raiz: http://localhost:3000 (CORS: use localhost, não 127.0.0.1)
 *
 * PowerShell:
 *   $env:AXE_TEST_EMAIL="seu@email.com"
 *   $env:AXE_TEST_PASSWORD="sua_senha"
 *   node scripts/capture-axecloud.mjs
 */
import { chromium } from 'playwright';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dir, '../public/screenshots');
const base = process.env.AXE_DEV_URL || 'http://localhost:3000/';

const email = process.env.AXE_TEST_EMAIL?.trim() || '';
const pass = process.env.AXE_TEST_PASSWORD || '';

const LOGADO = [
  { name: 'Início', file: 'painel-inicio.png' },
  { name: 'Filhos de Santo', file: 'filhos-de-santo.png' },
  { name: 'Calendário / Eventos', file: 'calendario-eventos.png' },
  { name: 'Mural', file: 'mural.png' },
  { name: 'Almoxarifado', file: 'almoxarifado.png' },
  { name: 'Financeiro', file: 'financeiro.png' },
  { name: 'Biblioteca de Estudo', file: 'biblioteca-estudo.png' },
  { name: 'Loja do Axé', file: 'loja-axe.png' },
];

async function gotoLogin(page) {
  const res = await page.goto(base, { waitUntil: 'networkidle', timeout: 120_000 });
  if (!res?.ok() && (res?.status() ?? 0) >= 400) {
    throw new Error(`HTTP ${res?.status()} ao abrir ${base}`);
  }
  await page.getByText('CLOUD', { exact: false }).first().waitFor({ state: 'visible', timeout: 60_000 });
}

async function shotPublicDesktop(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoLogin(page);
  await page.screenshot({ path: join(outDir, 'tela-acesso-axecloud.png'), type: 'png' });
  try {
    await page.locator('form').first().screenshot({ path: join(outDir, 'formulario-de-acesso.png') });
  } catch {
    console.warn('[capture] aviso: crop do formulário falhou');
  }
}

async function shotPublicMobile(browser) {
  const m = await browser.newPage({ viewport: { width: 420, height: 820 } });
  await gotoLogin(m);
  await m.screenshot({ path: join(outDir, 'acesso-celular.png'), type: 'png' });
  await m.close();
}

const browser = await chromium.launch();
try {
  await mkdir(outDir, { recursive: true });
  const page = await browser.newPage();
  let lastDialog = '';
  const onDialog = async (d) => {
    lastDialog = d.message();
    try {
      await d.accept();
    } catch {
      // ignorado
    }
  };
  page.on('dialog', onDialog);

  if (!email || !pass) {
    await shotPublicDesktop(page);
    await shotPublicMobile(browser);
    await page.close();
  } else {
    await shotPublicDesktop(page);
    await shotPublicMobile(browser);

    lastDialog = '';
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(pass);
    await page.getByRole('button', { name: /Entrar no Sistema/i }).click();

    await page.getByRole('button', { name: 'Início' }).first().waitFor({ state: 'visible', timeout: 120_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(4000);

    for (const t of LOGADO) {
      lastDialog = '';
      await page.locator('aside').getByRole('button', { name: t.name, exact: true }).click({ timeout: 15_000 });
      await page.waitForTimeout(400);
      if (/exclusivo|não está disponível|não está dispon|plano|Plano|recurso/i.test(lastDialog)) {
        console.warn(`[capture] módulo indisponível no plano: ${t.name} — ${lastDialog.slice(0, 100)}`);
        lastDialog = '';
        continue;
      }
      lastDialog = '';
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2000);
      await page.screenshot({ path: join(outDir, t.file), type: 'png' });
      console.log(`[capture] ${t.file} OK`);
    }
    await page.close();
  }

  await browser.close();
  const files = [
    'tela-acesso-axecloud.png',
    'acesso-celular.png',
    'formulario-de-acesso.png',
    ...LOGADO.map((l) => l.file),
  ];
  for (const f of files) {
    try {
      const s = await stat(join(outDir, f));
      console.log(`[capture] ${f} — ${(s.size / 1024).toFixed(1)} KB`);
    } catch {
      // não gerado
    }
  }
} catch (e) {
  try {
    await browser.close();
  } catch {
    // ignorado
  }
  console.error(e);
  process.exit(1);
}

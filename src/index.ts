import { config, ensureAuditDir, hasLlm } from './config.js';
import { createApp } from './server/app.js';
import { SessionManager } from './server/sessionManager.js';

ensureAuditDir();

const manager = new SessionManager();
const app = createApp(manager);

const port = config.port;
app.listen(port, () => {
  console.log();
  console.log('  ⚡ Volt & Co. — AI Buyer demo (Razorpay Buildathon, Track 01)');
  console.log(`  ➜  http://localhost:${port}`);
  console.log();
  console.log(`  planner  : ${hasLlm() ? 'LLM (tool-calling)' : 'heuristic (offline)'}  ${hasLlm() ? `— ${config.llm.model}` : '— set LLM_API_KEY for the LLM agent'}`);
  console.log(`  payments : ${config.razorpay.keyId ? 'Razorpay test-mode API' : 'mock provider (set RAZORPAY_KEY_ID/SECRET for real test mode)'}`);
  console.log(`  audit    : ${config.auditDir}`);
  console.log();
});

/**
 * Print the WhatsApp templates in the form Meta's WhatsApp Manager wants.
 *
 * Every business-initiated message this app sends must be an approved template.
 * Run `npm run wa:templates`, register each of these in WhatsApp Manager under
 * exactly the name shown, and alerts start flowing once they are approved.
 */
import { TEMPLATES } from "../src/lib/whatsapp/templates";

console.log("\nWhatsApp templates to register in Meta WhatsApp Manager");
console.log("======================================================\n");

for (const spec of Object.values(TEMPLATES)) {
  console.log(`Name      ${spec.name}`);
  console.log(`Category  ${spec.category}`);
  console.log(`Languages en, hi`);
  console.log(`Variables ${spec.params.length}`);
  spec.params.forEach((p, i) => console.log(`  {{${i + 1}}}  ${p}`));
  console.log(`\n  EN  ${spec.body.en}`);
  console.log(`  HI  ${spec.body.hi}`);
  console.log("\n------------------------------------------------------\n");
}

console.log(`${Object.keys(TEMPLATES).length} templates.`);
console.log("Set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN and");
console.log("WHATSAPP_VERIFY_TOKEN, then point Meta's webhook at");
console.log("  https://<your-app>/api/whatsapp/webhook\n");
process.exit(0);

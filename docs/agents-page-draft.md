# brighty.app/en/business/agents — page rewrite draft

**Status:** copy draft for the web team. The current live page recommends
`npx -y github:Maay/brighty_mcp` — that's the **upstream pre-fork
version** with the `brighty_setup` credential-write tool that we
deliberately removed (see `docs/SECURITY.md`, "Threat model:
prompt-injected credential writes"). It must be replaced before the
page goes anywhere near a customer with an Owner-role API key.

ToV applied per skill:

- 🟢 **WARM** — hero, capability cards, "How it works"
- 🟡 **CLEAR** — install instructions, code samples
- 🔴 **STEADY** — money-movement disclosure, the section asking the
  operator to consent to agent-driven payments

---

## Hero

> **Banking your agent can run.**
>
> Open accounts, issue cards, pay invoices, run payroll — through a
> Claude, Codex, or Cursor conversation. One install, one API key,
> one clear set of guardrails.

Primary CTA: **Install in Claude Code** → links to /docs/agents/install
or scrolls to install section.
Secondary CTA: **Read the API docs** → apidocs.brighty.app

(Steady Wit check: confident, not bragging. "Banking your agent can
run" — short, owns the action. No "supercharge", no "AI-native", no
exclamation marks.)

---

## What it does

Six capability cards, one line each. CLEAR mode.

1. **Open accounts.** CURRENT for spend, SAVING for vault. Any
   currency Brighty supports.
2. **Send payments.** SEPA, SWIFT, ACH, on-chain. One transfer or a
   batch of thousands.
3. **Pay invoices.** From a PDF or a forwarded email. The agent
   extracts the fields and waits for your confirmation.
4. **Run payroll.** Drop a CSV, the agent stages every transfer, you
   review, then commit.
5. **Issue cards.** Virtual or physical. Set the spend policy, freeze
   on suspicion, unfreeze on confirmation.
6. **Convert balances.** Live FX between your own accounts at the
   real Brighty rate.

(No fluff. Each card names the tool category and the agent's role.
"Confirmation" is mentioned twice on purpose — sets expectations early.)

---

## How it works

Three steps. WARM, but the third step is STEADY-adjacent because money.

1. **Install once.** Two commands in Claude Code, or one MCP config
   block in any other client. The agent gains 24 banking tools and
   four skills that teach it when to use them.
2. **Set your key.** A Brighty API key from your Business Portal. Per
   operator, per machine. Never goes through the agent.
3. **Ask in plain language.** _"Pay this invoice."_ _"What's my EUR
   balance?"_ _"Run April salaries from the payroll account."_ The
   agent drafts the call. **You confirm before any money moves.**

(Steady Wit check: "before any money moves" is bold on purpose. We own
what happens. We don't say "AI handles your money" because it doesn't
— the agent drafts, the operator commits.)

---

## Install

CLEAR mode. The current `Maay/brighty_mcp` block must come out.

### Claude Code / Claude Desktop

```text
/plugin marketplace add razz-team/brighty-agent-toolkit
/plugin install brighty@brighty-agent-toolkit
```

Set `BRIGHTY_API_KEY` in the shell that starts Claude, then restart
Claude. That's it.

### Cursor, Codex, or any MCP-compatible client

Add to your client's MCP config:

```json
{
  "mcpServers": {
    "brighty": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "@brighty-app/mcp-server@0.0.1", "brighty-mcp"],
      "env": {
        "BRIGHTY_API_KEY": "${BRIGHTY_API_KEY}"
      }
    }
  }
}
```

The package is on npm under [`@brighty-app/mcp-server`](https://www.npmjs.com/package/@brighty-app/mcp-server).
Source on [GitHub](https://github.com/razz-team/brighty-agent-toolkit).

(Drop the prior `clawhub install brighty` line. ClawHub publishing is
on the roadmap, not done. Putting a copy-paste command for something
that doesn't exist is worse than not mentioning it.)

---

## Code: a real conversation

Show one realistic exchange — not a vapid "Hi Brighty 👋". CLEAR mode.

> **You:** Show me the EUR account balance.
>
> **Agent:** Calls `brighty_list_accounts`. Returns:
>
> ```
> EUR Current — €12,403.50
> EUR Savings — €50,000.00
> ```
>
> **You:** Pay this invoice. _(attaches PDF)_
>
> **Agent:** Extracts the invoice fields. Shows you:
>
> ```
> Recipient: Acme Industries GmbH
> IBAN: DE89 3704 0044 0532 0130 00
> Amount: €1,234.56
> Reference: INV-2026-04-001
> Source: EUR Current (€12,403.50)
> ```
>
> **Confirm?**
>
> **You:** Yes.
>
> **Agent:** Calls `brighty_create_payout`, then
> `brighty_create_external_transfer`, then
> `brighty_start_payout` after you re-confirm the staged transfer.

(One real flow > five fake ones.)

---

## What stays under your control

🔴 STEADY mode. No wit. This block is the trust contract.

> **The operator decides every payment. The agent never moves money
> on its own.**
>
> Every money-moving call (`brighty_start_payout`,
> `brighty_transfer_own`, `brighty_freeze_card`,
> `brighty_terminate_account`) requires explicit confirmation from
> the operator before the request reaches Brighty. Your client (Claude
> Code, Cursor, etc.) gates the call; the toolkit makes the gate
> visible by surfacing every resolved field — IBANs, amounts,
> currencies, source accounts — verbatim, before the call.
>
> Your API key never passes through the agent. It is read from your
> environment or your OS keychain by the local MCP server, attached as
> the `Authorization` header on the way to Brighty, and never logged.
> No tool in this toolkit accepts a credential as an argument — by
> design.
>
> If you run an unattended agent with auto-approve enabled on Brighty
> tools, you accept the corresponding risk. We recommend leaving
> auto-approve **off** for any tool whose name starts with
> `brighty_create_`, `brighty_start_`, `brighty_terminate_`, or
> `brighty_freeze_`.

(Steady Wit check: every sentence owns the action. No "AI ensures",
no "powered by", no marketing softening. The auto-approve advice is
specific — names patterns, not vague "be careful".)

---

## Limits / what we don't do (yet)

Be honest. Roadmap, not a feature list.

- **3-DS approvals** — the agent cannot approve a 3-DS challenge for
  you. You handle those in the Brighty app.
- **Card termination** — exposed in the Brighty app, not in the
  toolkit. Freeze is reversible; termination isn't.
- **Hosted MCP** — the server runs locally as a subprocess of your
  client. There is no Brighty-hosted MCP endpoint and we are not
  planning one.

(Naming what we don't do is a Steady Wit move. Builds trust.)

---

## CTAs at the end

- **Install in Claude Code** → primary
- **Read the install guide** → AGENTS.md on GitHub
- **Open an issue** → github.com/razz-team/brighty-agent-toolkit/issues
- **Get an API key** → business.brighty.app/account/business

---

## Visual / illustration notes (for the design team)

Per the brand skill's "one illustration style":

- Hero illustration: agent + bank-vault iconography in the rough
  sandstone / concrete texture, single kintsugi chip with iridescent
  foil, directional light from upper-left. Stay on the white background;
  no shadow.
- Capability cards (6): each gets a small object icon in the same
  style, color dictated by semantic meaning (e.g. send-money = the
  existing dark gunmetal + steel sync symbol; cards = something
  plastic-deep-blue; FX = banknote + mirror once that one's
  generated).
- Money-movement section: NO illustration. Steady mode dictates
  text-only, no decorative breaks. The lack of imagery is the point.

---

## What to remove from the live page

- `claude mcp add brighty -- npx -y github:Maay/brighty_mcp` — points
  at a deprecated, less-secure fork. **Replace immediately.**
- `clawhub install brighty` — that command does not exist yet.
- Any "AI handles your money" / "agent runs your bank" framing — we
  own what happens, the agent drafts and the operator commits.

---

## Handoff checklist for web team

- [ ] Replace install commands with the `@brighty-app/mcp-server` form
      above
- [ ] Add the "What stays under your control" block (STEADY mode —
      legal/compliance should review, this is a public-facing trust
      statement)
- [ ] Update the hero copy if it currently uses "AI-native" /
      "supercharge" / similar
- [ ] Remove the `clawhub install` command until ClawHub publishing
      ships
- [ ] Link primary CTA to the new GitHub repo's
      [`AGENTS.md`](https://github.com/razz-team/brighty-agent-toolkit/blob/master/AGENTS.md)
      and the npm package page
- [ ] (Optional) Add a footnote pointing developers to
      `apidocs.brighty.app` for the underlying API

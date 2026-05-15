# Creative

Chat with AI to build React apps instantly. Developed by priyx with local open-source scraping.

<img src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZtaHFleGRsMTNlaWNydGdianI4NGQ4dHhyZjB0d2VkcjRyeXBucCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ZFVLWMa6dVskQX0qu1/giphy.gif" alt="Creative Demo" width="100%"/>

## Setup

1. **Clone & Install**
```bash
git clone https://github.com/priyx/creative.git
cd creative
pnpm install  # or npm install / yarn install
```

2. **Add `.env.local`**

```env
# =================================================================
# LOCAL WEB SCRAPING
# =================================================================
# URL scraping, markdown extraction, screenshots, and brand extraction run
# locally through Playwright, Readability, JSDOM, and Turndown.
# Optional: self-host SearXNG to enable search terms.
# SEARXNG_URL=http://localhost:8080

# =================================================================
# AI PROVIDER - free/auto default
# =================================================================
GROQ_API_KEY=your_groq_api_key                  # https://console.groq.com
GEMINI_API_KEY=your_gemini_api_key              # https://aistudio.google.com/app/apikey
OPENROUTER_API_KEY=your_openrouter_api_key      # https://openrouter.ai/keys

# Optional paid/provider-specific keys
ANTHROPIC_API_KEY=your_anthropic_api_key        # https://console.anthropic.com
OPENAI_API_KEY=your_openai_api_key              # https://platform.openai.com

# By default, Creative uses Auto Free Model:
# GROQ_API_KEY -> openai/gpt-oss-20b
# GEMINI_API_KEY -> google/gemini-2.5-flash-lite
# OPENROUTER_API_KEY -> openrouter/free

# =================================================================
# FAST APPLY (Optional - for faster edits)
# =================================================================
MORPH_API_KEY=your_morphllm_api_key    # https://morphllm.com/dashboard

# =================================================================
# SANDBOX PROVIDER
# =================================================================
SANDBOX_PROVIDER=webcontainer

# StackBlitz WebContainer runs the generated Vite app locally in your browser.
# No remote sandbox or sandbox API key is required.
```

3. **Run**
```bash
pnpm dev  # or npm run dev / yarn dev
```

Open [http://localhost:3000](http://localhost:3000)

WebContainer requires cross-origin isolation headers. Creative configures these in
`next.config.ts`; restart `pnpm dev` after changing the config. Chromium-based
desktop browsers have the most reliable embedded preview support.

If screenshots fail on a fresh machine, install the Playwright browser once:

```bash
npx playwright install chromium
```

## License

MIT

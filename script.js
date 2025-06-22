class GeminiWrapper {
  constructor() {
    this.apiKey = "AIzaSyD1PkDbJHqqhr8kTNd6qWeKgeWUiaHjlkI"  //this is the main api key for running the bot 
    this.model = "gemini-1.5-flash" 
    this.temperature = 0.7
    this.maxTokens = 1000   // this is for setting page too 
    this.conversationHistory = []
    this.memoryEnabled = true
    this.memoryWindow = 10
    this.analytics = {
      totalRequests: 0,
      totalResponseTime: 0,
      tokensUsed: 0,
      successfulRequests: 0,
      toolUsage: {
        calculator: 0,
        datetime: 0,
        random: 0,
      },
      dailyUsage: [],
    }
    this.tools = this.initializeTools()
    this.chainHistory = []
  }
// this is for calculator use api key 
  initializeTools() { // this is for It sets up and returns a collection of tools.
    return {
      calculator: {  // this step for previewing 
        name: "calculator",  // takING THE name as calculator to priew in page 
        description: "Perform mathematical calculations", // describition for that particular tool 
        execute: (expression) => {  // this is main part  useful for showing in UI/tooltips
          try {
            this.analytics.toolUsage.calculator++ //Start of a try block to handle any errors during calculation.
            const result = Function('"use strict"; return (' + expression + ")")()//Dynamically evaluates the math expression using Function()."use strict" ensures safe, 
            // strict JavaScript rules. it mean run without bug and No variables are used wrongly
            //Example: "2 + 2" becomes Function('"use strict"; return (2 + 2)')() → 4.
            return `Result: ${result}`// Returns the final result as a formatted string, in this example case like Result: 4.
          } catch (error) {
            return `Error: Invalid mathematical expression`
          }
        },
      },
      datetime: {
        name: "datetime",
        description: "Get current date and time",
        execute: () => {
          this.analytics.toolUsage.datetime++
          const now = new Date()
          return `Current date and time: ${now.toLocaleString()}`
        },
      },
      random: {
        name: "random",
        description: "Generate random numbers or make random choices",
        execute: (params = {}) => {
          this.analytics.toolUsage.random++
          const { min = 1, max = 100, type = "number" } = params
          if (type === "number") {
            return `Random number: ${Math.floor(Math.random() * (max - min + 1)) + min}`
          }
          return `Random decimal: ${Math.random()}`
        },
      },
    }
  }

  configure(config) {
    this.apiKey = config.apiKey || this.apiKey
    this.model = config.model || this.model
    this.temperature = config.temperature || this.temperature
    this.maxTokens = config.maxTokens || this.maxTokens
  }

  addToMemory(role, content) {
    if (this.memoryEnabled) {
      this.conversationHistory.push({ role, content, timestamp: Date.now() })

      if (this.conversationHistory.length > this.memoryWindow) {
        this.conversationHistory = this.conversationHistory.slice(-this.memoryWindow)
      }
    }
  }

  getConversationContext() {
    if (!this.memoryEnabled || this.conversationHistory.length === 0) {
      return []
    }

    return this.conversationHistory.map((msg) => ({
      role: msg.role === "ai" ? "model" : "user",
      parts: [{ text: msg.content }],
    }))
  }

  async generateResponse(prompt, options = {}) {
    const startTime = Date.now()
    this.analytics.totalRequests++

    try {
      this.addToMemory("user", prompt)

      const toolResponse = this.checkForToolUsage(prompt)
      if (toolResponse) {
        this.addToMemory("ai", toolResponse)
        return {
          success: true,
          response: toolResponse,
          isToolResponse: true,
          responseTime: Date.now() - startTime,
        }
      }

      const requestBody = {
        contents: [
          ...this.getConversationContext(),
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: this.temperature,
          maxOutputTokens: this.maxTokens,
          topP: 0.8,
          topK: 10,
        },
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, // this is for lagnauage swithcing to the ai bot
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      )

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error("No response generated")
      }

      const aiResponse = data.candidates[0].content.parts[0].text
      const responseTime = Date.now() - startTime

      this.addToMemory("ai", aiResponse)

      this.analytics.successfulRequests++
      this.analytics.totalResponseTime += responseTime
      this.analytics.tokensUsed += data.usageMetadata?.totalTokenCount || 0

      // Track daily usage
      const today = new Date().toDateString()
      const existingDay = this.analytics.dailyUsage.find((day) => day.date === today)
      if (existingDay) {
        existingDay.requests++
      } else {
        this.analytics.dailyUsage.push({ date: today, requests: 1 })
      }

      return {
        success: true,
        response: aiResponse,
        responseTime,
        tokensUsed: data.usageMetadata?.totalTokenCount || 0,
      }
    } catch (error) {
      const responseTime = Date.now() - startTime
      this.analytics.totalResponseTime += responseTime

      return {
        success: false,
        error: error.message,
        responseTime,
      }
    }
  }

  checkForToolUsage(prompt) {
    const lowerPrompt = prompt.toLowerCase()

    if (lowerPrompt.includes("calculate") || lowerPrompt.includes("math") || /\d+[+\-*/]\d+/.test(prompt)) {
      const mathExpression = prompt.match(/[\d+\-*/().\s]+/g)
      if (mathExpression) {
        return this.tools.calculator.execute(mathExpression[0])
      }
    }

    if (lowerPrompt.includes("time") || lowerPrompt.includes("date") || lowerPrompt.includes("now")) {
      return this.tools.datetime.execute()
    }

    if (lowerPrompt.includes("random") || lowerPrompt.includes("pick") || lowerPrompt.includes("choose")) {
      return this.tools.random.execute()
    }

    return null
  }

  async runChain(steps, initialInput) {
    let currentInput = initialInput
    const results = []
    const chainId = Date.now()

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const prompt = `${step}: ${currentInput}`

      const result = await this.generateResponse(prompt)
      if (!result.success) {
        throw new Error(`Chain failed at step ${i + 1}: ${result.error}`)
      }

      results.push({
        step: i + 1,
        instruction: step,
        input: currentInput,
        output: result.response,
      })

      currentInput = result.response
    }

    const chainResult = {
      id: chainId,
      timestamp: Date.now(),
      steps: steps,
      initialInput: initialInput,
      results: results,
      finalOutput: currentInput,
    }

    this.chainHistory.unshift(chainResult)
    if (this.chainHistory.length > 10) {
      this.chainHistory = this.chainHistory.slice(0, 10)
    }

    return {
      success: true,
      results,
      finalOutput: currentInput,
    }
  }

  clearMemory() {
    this.conversationHistory = []
  }

  getAnalytics() {
    const avgResponseTime =
      this.analytics.totalRequests > 0 ? Math.round(this.analytics.totalResponseTime / this.analytics.totalRequests) : 0

    const successRate =
      this.analytics.totalRequests > 0
        ? Math.round((this.analytics.successfulRequests / this.analytics.totalRequests) * 100)
        : 100

    return {
      totalRequests: this.analytics.totalRequests,
      avgResponseTime,
      tokensUsed: this.analytics.tokensUsed,
      successRate,
      toolUsage: this.analytics.toolUsage,
      dailyUsage: this.analytics.dailyUsage,
    }
  }

  exportData() {
    return {
      analytics: this.analytics,
      conversationHistory: this.conversationHistory,
      chainHistory: this.chainHistory,
      settings: {
        model: this.model,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        memoryEnabled: this.memoryEnabled,
        memoryWindow: this.memoryWindow,
      },
    }
  }
}
// THIS IS FOR COUSTOMISE THE LANGUAGE FOR ALL IN AS USER THEY WANT

// UI Controller Class
class UIController {
  constructor() {
    this.geminiWrapper = new GeminiWrapper()
    this.isSidebarCollapsed = false
    this.isDarkMode = false
    this.currentPage = "chat"
    this.charts = {}
    this.currentLanguage = "english"
    this.translations = {
      english: {
        chatPlaceholder: "Ask Sai anything...",
        sendButton: "Send",
        clearChat: "Clear chat",
        settingsSaved: "Settings saved successfully!",
        errorOccurred: "An error occurred!",
      },
      hindi: {
        chatPlaceholder: "साई से कुछ भी पूछें...",
        sendButton: "भेजें",
        clearChat: "चैट साफ़ करें",
        settingsSaved: "सेटिंग्स सफलतापूर्वक सहेजी गईं!",
        errorOccurred: "एक त्रुटि हुई!",
      },
      telugu: {
        chatPlaceholder: "సాయిని ఏదైనా అడగండి...",
        sendButton: "పంపు",
        clearChat: "చాట్ క్లియర్ చేయండి",
        settingsSaved: "సెట్టింగులు విజయవంతంగా సేవ్ చేయబడ్డాయి!",
        errorOccurred: "ఒక లోపం సంభవించింది!",
      },
    }

    this.initializeEventListeners()
    this.updateAnalyticsDisplay()
    this.initializeCharts()
  }

  initializeEventListeners() {
    // Sidebar toggle
    document.getElementById("toggleSidebar").addEventListener("click", () => {
      this.toggleSidebar()
    })

    // Settings button
    document.getElementById("settingsBtn").addEventListener("click", () => {
      this.navigateToSection("settings")
    })

    // Navigation
    document.querySelectorAll(".sidebar-nav a").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault()
        const section = e.target.closest("a").getAttribute("data-section")
        this.navigateToSection(section)
      })
    })

    // Configuration controls
    document.getElementById("apiKey").addEventListener("input", (e) => {
      this.geminiWrapper.configure({ apiKey: e.target.value })
    })

    document.getElementById("modelSelect").addEventListener("change", (e) => {
      this.geminiWrapper.configure({ model: e.target.value })
    })

    document.getElementById("temperature").addEventListener("input", (e) => {
      const value = Number.parseFloat(e.target.value)
      document.getElementById("tempValue").textContent = value
      this.geminiWrapper.configure({ temperature: value })
    })

    document.getElementById("maxTokens").addEventListener("input", (e) => {
      this.geminiWrapper.configure({ maxTokens: Number.parseInt(e.target.value) })
    })

    // Toggle API key visibility
    document.getElementById("toggleKey").addEventListener("click", () => {
      const keyInput = document.getElementById("apiKey")
      const toggleBtn = document.getElementById("toggleKey")

      if (keyInput.type === "password") {
        keyInput.type = "text"
        toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>'
      } else {
        keyInput.type = "password"
        toggleBtn.innerHTML = '<i class="fas fa-eye"></i>'
      }
    })

    // Chat controls
    document.getElementById("sendMessage").addEventListener("click", () => {
      this.sendMessage()
    })

    document.getElementById("userInput").addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        this.sendMessage()
      }
    })

    document.getElementById("clearChat").addEventListener("click", () => {
      this.clearChat()
    })

    // Suggestion chips
    document.querySelectorAll(".suggestion-chip").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        const prompt = e.target.getAttribute("data-prompt")
        document.getElementById("userInput").value = prompt
        this.sendMessage()
      })
    })

    // Chain operations
    document.getElementById("runChain").addEventListener("click", () => {
      this.runChainOperation()
    })

    document.getElementById("saveChain").addEventListener("click", () => {
      this.saveChainTemplate()
    })

    // Memory controls
    document.getElementById("enableMemory").addEventListener("change", (e) => {
      this.geminiWrapper.memoryEnabled = e.target.checked
      this.updateMemoryDisplay()
    })

    document.getElementById("memoryWindow").addEventListener("change", (e) => {
      this.geminiWrapper.memoryWindow = Number.parseInt(e.target.value)
    })

    document.getElementById("clearMemory").addEventListener("click", () => {
      this.geminiWrapper.clearMemory()
      this.updateMemoryDisplay()
      this.showToast("Memory cleared successfully!", "success")
    })

    document.getElementById("exportMemory").addEventListener("click", () => {
      this.exportMemory()
    })

    // Tool buttons
    document.querySelectorAll(".tool-button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tool = e.target.getAttribute("data-tool")
        this.executeTool(tool)
      })
    })

    // Settings
    document.getElementById("saveSettings").addEventListener("click", () => {
      this.saveSettings()
    })

    document.getElementById("resetSettings").addEventListener("click", () => {
      this.resetSettings()
    })

    document.getElementById("darkMode").addEventListener("change", (e) => {
      this.toggleDarkMode(e.target.checked)
    })

    // Language selector
    document.getElementById("languageSelect").addEventListener("change", (e) => {
      this.changeLanguage(e.target.value)
    })

    // Reports
    document.getElementById("generateReport").addEventListener("click", () => {
      this.generatePDFReport()
    })

    document.getElementById("exportData").addEventListener("click", () => {
      this.exportRawData()
    })

    // Initialize memory display
    this.updateMemoryDisplay()
  }

  navigateToSection(section) {
    console.log("Navigating to section:", section) // Debug log

    // Update sidebar active state
    document.querySelectorAll(".sidebar-nav li").forEach((li) => {
      li.classList.remove("active")
    })

    const sidebarLink = document.querySelector(`[data-section="${section}"]`)
    if (sidebarLink) {
      sidebarLink.closest("li").classList.add("active")
    }

    // Update header
    const titles = {
      chat: { title: "Sai - AI Assistant", description: "Interact with Google's Gemini model through LangChain" },
      chains: { title: "Chain Operations", description: "Create and execute sequential AI processing workflows" },
      tools: { title: "AI Tools", description: "Access integrated tools and utilities for enhanced productivity" },
      memory: { title: "Memory Management", description: "Manage conversation history and context settings" },
      reports: { title: "Analytics & Reports", description: "Comprehensive usage statistics and performance insights" },
      about: { title: "About Sai", description: "Learn about the founder and project vision" },
      settings: { title: "Settings", description: "Configure your AI assistant preferences and API settings" },
    }

    const sectionInfo = titles[section] || titles.chat
    document.getElementById("sectionTitle").textContent = sectionInfo.title
    document.getElementById("sectionDescription").textContent = sectionInfo.description

    // Hide all pages first
    document.querySelectorAll(".page").forEach((page) => {
      page.classList.remove("active")
      page.style.display = "none" // Force hide
    })

    // Show the target page
    const pageMapping = {
      chat: "chatPage",
      chains: "chainsPage",
      tools: "toolsPage",
      memory: "memoryPage",
      reports: "reportsPage",
      about: "aboutPage",
      settings: "settingsPage",
    }

    const targetPageId = pageMapping[section] || "chatPage"
    const targetPage = document.getElementById(targetPageId)

    console.log("Target page ID:", targetPageId, "Found element:", !!targetPage) // Debug log

    if (targetPage) {
      targetPage.style.display = "block" // Force show
      targetPage.classList.add("active")
      this.currentPage = section

      // Update specific page content based on section
      setTimeout(() => {
        if (section === "reports") {
          this.updateAnalyticsDisplay()
          this.updateCharts()
        } else if (section === "memory") {
          this.updateMemoryDisplay()
        } else if (section === "chains") {
          this.updateChainHistory()
        }
      }, 100)
    } else {
      console.error("Page not found:", targetPageId)
    }
  }

  async sendMessage() {
    const userInput = document.getElementById("userInput")
    const message = userInput.value.trim()

    if (!message) return

    if (!this.geminiWrapper.apiKey) {
      this.showToast("Please enter your Google Gemini API key in settings.", "error")
      return
    }

    userInput.value = ""
    this.addMessageToChat("user", message)
    this.showLoading()

    try {
      const result = await this.geminiWrapper.generateResponse(message)

      if (result.success) {
        this.addMessageToChat("ai", result.response, result.isToolResponse)
        this.updateAnalyticsDisplay()
        this.updateMemoryDisplay()
      } else {
        this.showToast(`Error: ${result.error}`, "error")
      }
    } catch (error) {
      this.showToast(`Unexpected error: ${error.message}`, "error")
    } finally {
      this.hideLoading()
    }
  }

  addMessageToChat(role, content, isToolResponse = false) {
    const chatMessages = document.getElementById("chatMessages")
    const messageDiv = document.createElement("div")
    messageDiv.className = `message ${role}-message`

    const timestamp = new Date().toLocaleTimeString()
    const roleLabel = role === "user" ? "You" : isToolResponse ? "Tool" : "Sai"

    const formattedContent = this.formatMessage(content)

    messageDiv.innerHTML = `
      <div class="message-content">
        <p>${formattedContent}</p>
      </div>
      <div class="message-info">
        <span class="message-time">${timestamp}</span>
      </div>
    `

    chatMessages.appendChild(messageDiv)
    chatMessages.scrollTop = chatMessages.scrollHeight
  }

  formatMessage(content) {
    return content
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>")
  }

  clearChat() {
    document.getElementById("chatMessages").innerHTML = `
      <div class="message system-message">
        <div class="message-content">
          <p>Chat cleared. I'm Sai, how can I assist you?</p>
        </div>
        <div class="message-info">
          <span class="message-time">${new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    `
    this.geminiWrapper.clearMemory()
    this.updateMemoryDisplay()
    this.showToast("Chat cleared successfully!", "success")
  }

  async runChainOperation() {
    const step1 = document.getElementById("step1").value.trim()
    const step2 = document.getElementById("step2").value.trim()
    const step3 = document.getElementById("step3").value.trim()

    if (!step1 || !step2 || !step3) {
      this.showToast("Please fill in all chain steps.", "error")
      return
    }

    if (!this.geminiWrapper.apiKey) {
      this.showToast("Please enter your Google Gemini API key.", "error")
      return
    }

    const initialInput = prompt("Enter the initial input for the chain:")
    if (!initialInput) return

    this.showLoading()

    try {
      const result = await this.geminiWrapper.runChain([step1, step2, step3], initialInput)

      if (result.success) {
        let chainOutput = "🔗 Chain Operation Results:\n\n"
        result.results.forEach((step) => {
          chainOutput += `**Step ${step.step}**: ${step.instruction}\n`
          chainOutput += `**Input**: ${step.input}\n`
          chainOutput += `**Output**: ${step.output}\n\n`
        })

        this.addMessageToChat("ai", chainOutput)
        this.updateAnalyticsDisplay()
        this.updateChainHistory()
        this.showToast("Chain executed successfully!", "success")
      }
    } catch (error) {
      this.showToast(`Chain operation failed: ${error.message}`, "error")
    } finally {
      this.hideLoading()
    }
  }

  saveChainTemplate() {
    const step1 = document.getElementById("step1").value.trim()
    const step2 = document.getElementById("step2").value.trim()
    const step3 = document.getElementById("step3").value.trim()

    if (!step1 || !step2 || !step3) {
      this.showToast("Please fill in all chain steps before saving.", "error")
      return
    }

    const template = {
      name: `Chain Template ${Date.now()}`,
      steps: [step1, step2, step3],
      created: new Date().toISOString(),
    }

    const templates = JSON.parse(localStorage.getItem("chainTemplates") || "[]")
    templates.push(template)
    localStorage.setItem("chainTemplates", JSON.stringify(templates))

    this.showToast("Chain template saved successfully!", "success")
  }

  updateChainHistory() {
    const historyContainer = document.getElementById("chainHistory")
    const history = this.geminiWrapper.chainHistory

    if (history.length === 0) {
      historyContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-link"></i>
          <p>No chains executed yet</p>
          <small>Create and run your first chain to see results here</small>
        </div>
      `
      return
    }

    historyContainer.innerHTML = history
      .map(
        (chain) => `
      <div class="chain-history-item">
        <div class="chain-header">
          <h4>Chain #${chain.id}</h4>
          <span class="chain-date">${new Date(chain.timestamp).toLocaleString()}</span>
        </div>
        <div class="chain-summary">
          <p><strong>Steps:</strong> ${chain.steps.length}</p>
          <p><strong>Input:</strong> ${chain.initialInput.substring(0, 50)}...</p>
          <p><strong>Output:</strong> ${chain.finalOutput.substring(0, 50)}...</p>
        </div>
      </div>
    `,
      )
      .join("")
  }

  executeTool(toolName) {
    let result = ""

    switch (toolName) {
      case "calculator":
        const expression = document.getElementById("calcInput").value.trim()
        if (!expression) {
          this.showToast("Please enter a mathematical expression.", "error")
          return
        }
        result = this.geminiWrapper.tools.calculator.execute(expression)
        document.getElementById("calcResult").textContent = result
        break

      case "datetime":
        result = this.geminiWrapper.tools.datetime.execute()
        document.getElementById("timeResult").textContent = result
        break

      case "random":
        const min = Number.parseInt(document.getElementById("randomMin").value) || 1
        const max = Number.parseInt(document.getElementById("randomMax").value) || 100
        result = this.geminiWrapper.tools.random.execute({ min, max })
        document.getElementById("randomResult").textContent = result
        break
    }

    this.updateAnalyticsDisplay()
    this.showToast("Tool executed successfully!", "success")
  }

  updateMemoryDisplay() {
    const memoryContent = document.getElementById("memoryContent")
    const history = this.geminiWrapper.conversationHistory

    if (history.length === 0) {
      memoryContent.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-comments"></i>
          <p>No conversation history</p>
          <small>Start chatting to see your conversation history here</small>
        </div>
      `
      return
    }

    let displayText = ""
    history.forEach((msg, index) => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString()
      displayText += `[${timestamp}] ${msg.role.toUpperCase()}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? "..." : ""}\n\n`
    })

    memoryContent.innerHTML = `<pre>${displayText}</pre>`
  }

  exportMemory() {
    const data = {
      conversationHistory: this.geminiWrapper.conversationHistory,
      exportDate: new Date().toISOString(),
      memorySettings: {
        enabled: this.geminiWrapper.memoryEnabled,
        window: this.geminiWrapper.memoryWindow,
      },
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sai-memory-export-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)

    this.showToast("Memory exported successfully!", "success")
  }

  updateAnalyticsDisplay() {
    const analytics = this.geminiWrapper.getAnalytics()

    document.getElementById("totalRequests").textContent = analytics.totalRequests
    document.getElementById("avgResponseTime").textContent = `${analytics.avgResponseTime}ms`
    document.getElementById("tokensUsed").textContent = analytics.tokensUsed.toLocaleString()
    document.getElementById("successRate").textContent = `${analytics.successRate}%`
  }

  initializeCharts() {
    // Create simple visual charts without external dependencies
    this.createSimpleCharts()
  }

  createSimpleCharts() {
    const usageChart = document.getElementById("usageChart")
    const toolsChart = document.getElementById("toolsChart")

    if (usageChart) {
      usageChart.innerHTML = this.createUsageChart()
    }

    if (toolsChart) {
      toolsChart.innerHTML = this.createToolsChart()
    }
  }

  createUsageChart() {
    const analytics = this.geminiWrapper.getAnalytics()
    const dailyData = analytics.dailyUsage.slice(-7) // Last 7 days

    if (dailyData.length === 0) {
      return '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);">📊 No usage data yet</div>'
    }

    const maxRequests = Math.max(...dailyData.map((d) => d.requests), 1)

    return `
      <div style="display: flex; align-items: end; justify-content: space-around; height: 100%; padding: 20px;">
        ${dailyData
          .map((day) => {
            const height = (day.requests / maxRequests) * 80
            const date = new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            return `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
              <div style="width: 30px; height: ${height}%; background: var(--primary-color); border-radius: 4px; min-height: 4px;"></div>
              <span style="font-size: 12px; color: var(--text-secondary);">${date}</span>
              <span style="font-size: 10px; color: var(--text-tertiary);">${day.requests}</span>
            </div>
          `
          })
          .join("")}
      </div>
    `
  }

  createToolsChart() {
    const analytics = this.geminiWrapper.getAnalytics()
    const toolData = [
      { name: "Calculator", value: analytics.toolUsage.calculator, color: "#2563eb" },
      { name: "Date/Time", value: analytics.toolUsage.datetime, color: "#10b981" },
      { name: "Random", value: analytics.toolUsage.random, color: "#f59e0b" },
    ]

    const total = toolData.reduce((sum, tool) => sum + tool.value, 0)

    if (total === 0) {
      return '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);">🔧 No tool usage yet</div>'
    }

    return `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px;">
        <div style="display: flex; gap: 12px;">
          ${toolData
            .map((tool) => {
              const percentage = ((tool.value / total) * 100).toFixed(1)
              return `
              <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <div style="width: 60px; height: 60px; border-radius: 50%; background: ${tool.color}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                  ${tool.value}
                </div>
                <span style="font-size: 12px; color: var(--text-secondary);">${tool.name}</span>
                <span style="font-size: 10px; color: var(--text-tertiary);">${percentage}%</span>
              </div>
            `
            })
            .join("")}
        </div>
      </div>
    `
  }

  updateCharts() {
    // Update the simple charts
    this.createSimpleCharts()
  }

  generatePDFReport() {
    this.showToast("PDF report generation would be implemented here.", "success")
  }

  exportRawData() {
    const data = this.geminiWrapper.exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sai-data-export-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)

    this.showToast("Data exported successfully!", "success")
  }

  saveSettings() {
    const darkMode = document.getElementById("darkMode").checked
    const fontSize = document.getElementById("fontSize").value
    const notifications = document.getElementById("enableNotifications").checked
    const sounds = document.getElementById("soundEffects").checked

    this.toggleDarkMode(darkMode)

    document.documentElement.style.fontSize =
      {
        small: "14px",
        medium: "16px",
        large: "18px",
      }[fontSize] || "16px"

    // Save to localStorage
    const settings = {
      darkMode,
      fontSize,
      notifications,
      sounds,
      apiKey: this.geminiWrapper.apiKey,
      model: this.geminiWrapper.model,
      temperature: this.geminiWrapper.temperature,
      maxTokens: this.geminiWrapper.maxTokens,
    }

    localStorage.setItem("saiSettings", JSON.stringify(settings))
    this.showToast("Settings saved successfully!", "success")
  }

  resetSettings() {
    localStorage.removeItem("saiSettings")

    // Reset form values
    document.getElementById("darkMode").checked = false
    document.getElementById("fontSize").value = "medium"
    document.getElementById("enableNotifications").checked = true
    document.getElementById("soundEffects").checked = true
    document.getElementById("temperature").value = 0.7
    document.getElementById("tempValue").textContent = "0.7"
    document.getElementById("maxTokens").value = 1000

    // Reset wrapper settings
    this.geminiWrapper.configure({
      temperature: 0.7,
      maxTokens: 1000,
    })

    this.toggleDarkMode(false)
    document.documentElement.style.fontSize = "16px"

    this.showToast("Settings reset to defaults!", "success")
  }

  toggleSidebar() {
    const sidebar = document.querySelector(".sidebar")
    this.isSidebarCollapsed = !this.isSidebarCollapsed

    if (this.isSidebarCollapsed) {
      sidebar.classList.add("collapsed")
    } else {
      sidebar.classList.remove("collapsed")
    }
  }

  toggleDarkMode(enabled) {
    this.isDarkMode = enabled

    if (enabled) {
      document.body.classList.add("dark-mode")
    } else {
      document.body.classList.remove("dark-mode")
    }
  }

  showLoading() {
    document.getElementById("loadingOverlay").classList.add("active")
  }

  hideLoading() {
    document.getElementById("loadingOverlay").classList.remove("active")
  }

  changeLanguage(language) {
    this.currentLanguage = language
    const translations = this.translations[language]

    // Update UI text
    document.getElementById("userInput").placeholder = translations.chatPlaceholder

    // Update any other translatable elements
    const clearChatBtn = document.getElementById("clearChat")
    if (clearChatBtn) {
      clearChatBtn.title = translations.clearChat
    }

    // Save language preference
    localStorage.setItem("saiLanguage", language)

    this.showToast(translations.settingsSaved, "success")
  }

  showToast(message, type = "success") {
    const toast = document.getElementById(type === "success" ? "successToast" : "errorToast")
    const messageElement = toast.querySelector("span")

    messageElement.textContent = message
    toast.classList.add("show")

    setTimeout(() => {
      toast.classList.remove("show")
    }, 3000)
  }

  loadSettings() {
    const savedSettings = localStorage.getItem("saiSettings")
    const savedLanguage = localStorage.getItem("saiLanguage")

    if (savedLanguage && this.translations[savedLanguage]) {
      this.currentLanguage = savedLanguage
      document.getElementById("languageSelect").value = savedLanguage
      this.changeLanguage(savedLanguage)
    }

    if (savedSettings) {
      const settings = JSON.parse(savedSettings)

      document.getElementById("darkMode").checked = settings.darkMode || false
      document.getElementById("fontSize").value = settings.fontSize || "medium"
      document.getElementById("enableNotifications").checked = settings.notifications !== false
      document.getElementById("soundEffects").checked = settings.sounds !== false

      if (settings.temperature !== undefined) {
        document.getElementById("temperature").value = settings.temperature
        document.getElementById("tempValue").textContent = settings.temperature
      }

      if (settings.maxTokens) {
        document.getElementById("maxTokens").value = settings.maxTokens
      }

      this.toggleDarkMode(settings.darkMode || false)

      document.documentElement.style.fontSize =
        {
          small: "14px",
          medium: "16px",
          large: "18px",
        }[settings.fontSize] || "16px"

      // Apply to wrapper
      this.geminiWrapper.configure({
        temperature: settings.temperature || 0.7,
        maxTokens: settings.maxTokens || 1000,
      })
    }
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  const ui = new UIController()
  ui.loadSettings()
})

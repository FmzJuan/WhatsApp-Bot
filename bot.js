const fs = require("fs");
const PDFDocument = require("pdfkit");
const readline = require("readline");
const { create } = require("@wppconnect-team/wppconnect");

// Interface de leitura no terminal (para respostas manuais)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let contactsLog = [];

// ========== Números de redirecionamento ==========
const WPP_INTERNACIONAL_LIST = [
  "5511913595007", // Luciana
  "5511972387245", // Larissa
];
let internationalIndex = 0;

const WPP_NACIONAL = "5511964180466"; // Jr
const WPP_JRP = "11963810995"; // Hannah (jrp)
const WPP_INTERNACIONAL_AGENTE = "5511997710118"; // Cris

// ========== Funções de Log ==========
function loadContactsLog() {
  if (fs.existsSync("contactsLog.json")) {
    contactsLog = JSON.parse(fs.readFileSync("contactsLog.json", "utf-8"));
  }
}

function saveContactsLog() {
  fs.writeFileSync("contactsLog.json", JSON.stringify(contactsLog, null, 2));
}

function addContactToLog(message) {
  const from = message.from;
  const name = message.sender.pushname || "Sem nome";
  const date = new Date().toLocaleString("pt-BR");

  if (!contactsLog.some((c) => c.from === from)) {
    contactsLog.push({ from, name, date, type: null });
    saveContactsLog();
    console.log(`📝 Novo contato adicionado ao log: ${name} (${from})`);
  }
}

function updateContactType(from, type) {
  const contact = contactsLog.find((c) => c.from === from);
  if (contact) {
    contact.type = type;
    saveContactsLog();
  }
}

// ========== Função PDF ==========
function generatePDFReport(callback) {
  const doc = new PDFDocument();
  const fileName = "relatorio_contatos.pdf";
  const stream = fs.createWriteStream(fileName);
  doc.pipe(stream);

  doc.fontSize(16).text("📊 Relatório de Contatos", { align: "center" });
  doc.moveDown();

  if (contactsLog.length === 0) {
    doc.fontSize(12).text("Nenhum contato registrado ainda.");
  } else {
    contactsLog.forEach((contact, index) => {
      doc
        .fontSize(12)
        .text(
          `${index + 1}. Nome: ${contact.name}\n   Número: ${
            contact.from
          }\n   Tipo: ${contact.type || "Não definido"}\n   Primeiro contato: ${
            contact.date
          }\n`
        );
      doc.moveDown();
    });
  }

  doc.end();
  stream.on("finish", () => {
    console.log(`✅ Relatório gerado: ${fileName}`);
    if (callback) callback(fileName);
  });
}

// ========== Menus ==========
async function sendWelcomeMenu(client, from) {
  const msg = `👋 *Bem-vindo(a) à Investur Operadora!*\nSou o assistente virtual e estou aqui para te ajudar.\n\n📋 Escolha uma opção:\n\n1️⃣ Agente de viagem\n2️⃣ Passageiro`;
  await client.sendText(from, msg);
}

async function sendMainMenu(client, from, type) {
  if (type.toLowerCase() === "agente de viagem") {
    await client.sendText(
      from,
      "📋 *Menu Agente de viagem:*\n\n1️⃣-Atendimento Internacional\n2️⃣-Nacional\n3️⃣-JRP\n4️⃣-Voltar"
    );
  } else {
    await client.sendText(
      from,
      "📋 *Menu Passageiro:*\n\n1️⃣-Atendimento Internacional\n2️⃣-Nacional\n3️⃣-JRP\n4️⃣-Voltar"
    );
  }
}

// ========== Início ==========
let userType = new Map();
let lastFrom = null;
let welcomeSent = new Map();
let botStartTime = new Date();
let errorAttempts = new Map();

// ====== NOVO: Controle de inatividade ======
let inactivityTimers = new Map();
function resetInactivityTimer(client, from) {
  // Cancela timers anteriores
  if (inactivityTimers.has(from)) {
    clearTimeout(inactivityTimers.get(from).timer10);
    clearTimeout(inactivityTimers.get(from).timer15);
  }

  // Timer de 10 minutos
  const timer10 = setTimeout(async () => {
    try {
      await client.sendText(
        from,
        "Olá, você ainda está aí? Caso precise, digite *4* para voltar ao menu principal."
      );
    } catch (e) {
      console.error("Erro ao enviar mensagem de 10 minutos:", e);
    }
  }, 10 * 60 * 1000);

  // Timer de 15 minutos
  const timer15 = setTimeout(async () => {
    try {
      await client.sendText(
        from,
        "Agradecemos seu contato com a Investur Operadora. Estaremos sempre à disposição caso precise de mais informações."
      );
    } catch (e) {
      console.error("Erro ao enviar mensagem de 15 minutos:", e);
    }
  }, 15 * 60 * 1000);

  inactivityTimers.set(from, { timer10, timer15 });
}

create()
  .then((client) => start(client))
  .catch((error) => console.error(error));

function start(client) {
  loadContactsLog();

  client.onMessage(async (message) => {
    if (!message.isGroupMsg && !message.from.includes("status@broadcast")) {
      const text = message.body.replace(/\D/g, "").trim();
      const from = message.from;
      lastFrom = from;

      const messageTimestamp = message.timestamp * 1000;
      if (messageTimestamp < botStartTime.getTime()) return;

      addContactToLog(message);

      // 🔹 Reset dos timers de inatividade
      resetInactivityTimer(client, from);

      // ---------- Relatório ----------
      if (text.toLowerCase() === "relatorio") {
        generatePDFReport(async (fileName) => {
          await client.sendFile(
            from,
            fileName,
            "relatorio.pdf",
            "📑 Aqui está seu relatório."
          );
        });
        return;
      }

      // ---------- Boas-vindas ----------
      if (!welcomeSent.has(from)) {
        await sendWelcomeMenu(client, from);
        welcomeSent.set(from, true);
        return;
      }

      // ---------- Reset ----------
      if (text === "0" || text === "4") {
        userType.delete(from);
        errorAttempts.delete(from);
        await sendWelcomeMenu(client, from);
        return;
      }

      // ---------- Escolha inicial ----------
      if (!userType.has(from)) {
        if (text === "1") {
          userType.set(from, "Agente de viagem");
          updateContactType(from, "Agente de viagem");
          errorAttempts.delete(from);
          await sendMainMenu(client, from, "Agente de viagem");
        } else if (text === "2") {
          userType.set(from, "Passageiro");
          updateContactType(from, "Passageiro");
          errorAttempts.delete(from);
          await sendMainMenu(client, from, "Passageiro");
        } else {
          let attempts = errorAttempts.get(from) || 0;
          attempts++;
          errorAttempts.set(from, attempts);

          if (attempts < 3) {
            await client.sendText(
              from,
              "*Por favor, escolha:*\n\n 1️⃣ Agente de viagem \n 2️⃣ Passageiro"
            );
          } else if (attempts === 3) {
            await client.sendText(
              from,
              "⚠️ Muitas tentativas inválidas. Para voltar, digite *0* (Ajuda)."
            );
          } else {
            console.log(
              `⚠️ Usuário ${from} excedeu tentativas inválidas. Bot não responderá mais.`
            );
          }
        }
        return;
      }

      // ---------- Menus ----------
      const type = (userType.get(from) || "").toLowerCase();
      switch (text) {
        case "1":
          if (type === "agente de viagem") {
            await client.sendText(
              from,
              `🔸  *Atendimento Internacional (Agente de viagem).* \n\n Clique no link para conversar com um de nossos agentes de viagens : https://wa.me/${WPP_INTERNACIONAL_AGENTE}`
            );
          } else {
            const numeroInternacional =
              WPP_INTERNACIONAL_LIST[internationalIndex];
            internationalIndex =
              (internationalIndex + 1) % WPP_INTERNACIONAL_LIST.length;
            await client.sendText(
              from,
              `🔸  *Atendimento Internacional (Passageiro).* \n\n Clique no link para conversar com um de nossos agentes de viagens : https://wa.me/${numeroInternacional}`
            );
          }
          break;
        case "2":
          await client.sendText(
            from,
            `🔸  *Atendimento Nacional.* \n\n Clique no link para conversar com um de nossos agentes de viagens : https://wa.me/${WPP_NACIONAL}`
          );
          break;
        case "3":
          await client.sendText(
            from,
            `🔸  *Atendimento JRP.* \n\n Clique no link para conversar com um de nossos agentes de viagens  para conversar com um de nossos agentes de viagens : https://wa.me/${WPP_JRP}`
          );
          break;
        default:
          break;
      }
    }
  });

  // ========== Resposta manual pelo CMD ==========
  function startManualReply() {
    rl.question("🖋️ Digite sua resposta (ou 'relatorio'): ", async (reply) => {
      reply = reply.trim();
      if (!reply) {
        console.log("⚠️ Resposta vazia, não será enviada.");
      } else if (reply.toLowerCase() === "relatorio") {
        generatePDFReport();
      } else {
        if (lastFrom) {
          try {
            await client.sendText(lastFrom, reply);
            console.log(`✅ Resposta manual enviada para ${lastFrom}: ${reply}`);
          } catch (err) {
            console.error("❌ Erro ao enviar resposta manual:", err);
          }
        } else {
          console.log("⚠️ Nenhuma conversa ativa para enviar resposta manual.");
        }
      }
      startManualReply();
    });
  }

  startManualReply();

  rl.on("SIGINT", () => {
    console.log("\n👋 Encerrando bot...");
    rl.close();
    process.exit(0);
  });
}

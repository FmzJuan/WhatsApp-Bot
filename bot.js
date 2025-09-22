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
const WPP_JRP = "5511963810995"; // Hannah (jrp)
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

// ====== Controle de inatividade ======
let inactivityTimers = new Map();
function resetInactivityTimer(client, from) {
  // Cancela timers anteriores
  if (inactivityTimers.has(from)) {
    clearTimeout(inactivityTimers.get(from).timer10);
    clearTimeout(inactivityTimers.get(from).timer15);
    inactivityTimers.delete(from);
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

// ========== Inicializa o bot ==========
create()
  .then((client) => start(client))
  .catch((error) => console.error(error));

function start(client) {
  loadContactsLog();
  startCommandPrompt(client);

  client.onMessage(async (message) => {
    if (!message.isGroupMsg && !message.from.includes("status@broadcast")) {
      const text = message.body.replace(/\D/g, "").trim();
      const from = message.from;
      lastFrom = from;

      // Log de mensagem recebida
      const name = message.sender.pushname || "Sem nome";
      console.log(`\n📩 Mensagem recebida de ${name} (${from}):\n${message.body}`);

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
          console.log(`\n✅ Relatório enviado para ${name} (${from})`);
        });
        return;
      }

      // ---------- Boas-vindas ----------
      if (!welcomeSent.has(from)) {
        await sendWelcomeMenu(client, from);
        welcomeSent.set(from, true);
        console.log(`\n✅ Menu de boas-vindas enviado para ${name} (${from})`);
        return;
      }

      // ---------- Reset ----------
      if (text === "0" || text === "4") {
        userType.delete(from);
        errorAttempts.delete(from);
        await sendWelcomeMenu(client, from);
        console.log(`\n✅ Menu reiniciado para ${name} (${from})`);
        return;
      }

      // ---------- Escolha inicial ----------
      if (!userType.has(from)) {
        if (text === "1") {
          userType.set(from, "Agente de viagem");
          updateContactType(from, "Agente de viagem");
          errorAttempts.delete(from);
          await sendMainMenu(client, from, "Agente de viagem");
          console.log(`\n✅ Usuário ${name} (${from}) selecionou Agente de viagem`);
        } else if (text === "2") {
          userType.set(from, "Passageiro");
          updateContactType(from, "Passageiro");
          errorAttempts.delete(from);
          await sendMainMenu(client, from, "Passageiro");
          console.log(`\n✅ Usuário ${name} (${from}) selecionou Passageiro`);
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
      let resposta = "";

      switch (text) {
        case "1":
          if (type === "agente de viagem") {
            resposta = `🔸  *Atendimento Internacional (Agente de viagem).* \n\n Clique no link para conversar com um de nossos agentes de viagens : https://wa.me/${WPP_INTERNACIONAL_AGENTE}`;
          } else {
            const numeroInternacional =
              WPP_INTERNACIONAL_LIST[internationalIndex];
            internationalIndex =
              (internationalIndex + 1) % WPP_INTERNACIONAL_LIST.length;
            resposta = `🔸  *Atendimento Internacional (Passageiro).* \n\n Clique no link para conversar com um de nossos agentes de viagens : https://wa.me/${numeroInternacional}`;
          }
          break;

        case "2":
          resposta = `🔸  *Atendimento Nacional.* \n\n Clique no link para conversar com um de nossos agentes de viagens : https://wa.me/${WPP_NACIONAL}`;
          break;

        case "3":
          resposta = `🔸  *Atendimento JRP.* \n\n Clique no link para conversar com um de nossos agentes de viagens: https://wa.me/${WPP_JRP}`;
          break;

        default:
          break;
      }

      if (resposta) {
        await client.sendText(from, resposta);
        console.log(`\n✅ Mensagem enviada para ${name} (${from}):\n${resposta}`);
      }
    }
  });

  // ========== Resposta manual pelo CMD ==========
  function startCommandPrompt(client) {
    rl.setPrompt("> ");
    rl.prompt();

    rl.on("line", (input) => {
      const command = input.trim();

      // ✅ Novo comando para enviar boas-vindas manualmente
      if (command.toLowerCase().startsWith("/boasvindas ")) {
        const numero = command.replace(/\/boasvindas\s+/i, "").trim();
        if (!numero) {
          console.log("❌ Informe o número: /boasvindas 558581776565");
        } else {
          // Adiciona o sufixo @c.us se não tiver
          const destinatario = numero.endsWith("@c.us")
            ? numero
            : `${numero}@c.us`;

          sendWelcomeMenu(client, destinatario)
            .then(() =>
              console.log(`✅ Boas-vindas enviadas para ${destinatario}`)
            )
            .catch((err) =>
              console.error(`❌ Erro ao enviar para ${destinatario}:`, err)
            );
        }
      }
      else if (command.toLowerCase() === "/relatorio") {
        generatePDFReport();
      }
      else {
        console.log("❌ Comando inválido. Use: /relatorio ou /boasvindas <numero>");
      }

      rl.prompt();
    });

    rl.on("SIGINT", () => {
      console.log("\n👋 Encerrando bot...");
      rl.close();
      process.exit(0);
    });
  }
}

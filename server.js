import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { verifyAdminToken } from "./middleware/verifyAdminToken.js";
dotenv.config();
const PORT = process.env.PORT || 5000;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
// Conexão com MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.error("Erro ao conectar no MongoDB:", err));
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import AdminUser from "./models/adminUser.js";



// Modelo de inscrição
const FormSchema = new mongoose.Schema({
  tipo: { type: String, required: true },

  // Campos tipo individual
  nome: { type: String, required: false },
  idade: { type: Number, required: false },
  email: { type: String, required: false },
  whatsapp: { type: String, required: false },
  profissao: { type: String, required: false },
  empresa: { type: String, required: false },
  outraProfissao: { type: String, required: false },

  // Campos tipo sócios
  nomeSocio1: { type: String, required: false },
  nomeSocio2: { type: String, required: false },
  idadeSocio1: { type: String, required: false },
  idadeSocio2: { type: String, required: false },
  emailSocio1: { type: String, required: false },
  emailSocio2: { type: String, required: false },
  whatsappSocio1: { type: String, required: false },
  whatsappSocio2: { type: String, required: false },
  profissaoSocio1: { type: String, required: false },
  profissaoSocio2: { type: String, required: false },
  empresaSocio: { type: String, required: false },

  // Extras
  data: { type: Date, default: Date.now },
  paymentId: { type: String, required: false },
  valor: { type: Number, required: false },
  status: { type: String, required: false }
});

const Form = mongoose.model("Form", FormSchema);

// Configuração Mercado Pago
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Função para enviar e-mail de confirmação
async function enviarEmailConfirmacao(destinatario, nome) {
  const mailOptions = {
    from: `"Mentoria Raiz" <${process.env.SMTP_USER}>`,
    to: destinatario,
    subject: "Pagamento Confirmado - Bem-vindo(a) à Mentoria Raiz!",
    html: `
      <p>Olá ${nome},</p>
      <p>Seu pagamento foi aprovado com sucesso!</p>
      <p>Entre no nosso grupo exclusivo pelo link abaixo:</p>
      <a href="https://chat.whatsapp.com/KOpFkKvy1ES5LdVGCbSJ3u">Grupo Especial Mentoria Raiz</a>
      <p>Obrigado por confiar em nossa mentoria.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// Contar inscritos individuais confirmados
async function getIndividualCount() {
  return await Form.countDocuments({ tipo: "individual" });
}

// Rota para criar pagamento
app.post("/api/inscricao", async (req, res) => {
  try {
    const { tipo } = req.body;

    let preco;
    let metadata = {};

    if (tipo === "individual") {
      const { nome, idade, email, whatsapp, profissao, empresa} = req.body;

      const count = await getIndividualCount();
      preco = count < 5 ? 0.1 : 3597;

      metadata = {
        tipo,
        nome,
        idade,
        email,
        whatsapp,
        profissao,
        empresa: profissao === "empreendedor" ? empresa : "",
      };

    } else if (tipo === "socios") {
      const {
        nomeSocio1,
        idadeSocio1,
        emailSocio1,
        profissaoSocio1,
        whatsappSocio1,
        nomeSocio2,
        idadeSocio2,
        emailSocio2,
        whatsappSocio2,
        profissaoSocio2,
        empresaSocio
      } = req.body;

      preco = 0.01;

      metadata = {
        tipo,
        nomeSocio1: nomeSocio1,
        idadeSocio1:idadeSocio1,
        emailSocio1: emailSocio1,
        nomeSocio2: nomeSocio2,
        idadeSocio2: idadeSocio2,
        emailSocio2: emailSocio2,
        whatsappSocio1: whatsappSocio1,
        whatsappSocio2: whatsappSocio2,
        profissaoSocio1: profissaoSocio1,
        profissaoSocio2: profissaoSocio2,
        empresaSocio: profissaoSocio1 === "empreendedor" ? empresaSocio : ""
      };
    } else {
      return res.status(400).json({ error: "Tipo inválido" });
    }

   const preference = new Preference(mpClient);
const result = await preference.create({
  body: {
    items: [ /* ... */ ],
    payer: {
      name: tipo === "individual" ? metadata.nome : metadata.nomeSocio1,
      email: tipo === "individual" ? metadata.email : metadata.emailSocio1,
    },
    back_urls: { /* ... */ },
    auto_return: "approved",
    metadata: {
      data: JSON.stringify(metadata) // << tudo serializado como string
    }
  },
});

    res.json({ init_point: result.init_point });
  } catch (error) {
    console.error("Erro na rota /api/inscricao:", error);
    res.status(500).json({ error: error.message || "Erro no processamento" });
  }
});


// Webhook para confirmar pagamento e enviar email
app.post("/api/webhook", async (req, res) => {
  try {
    const payment = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    

    if (payment.type === "payment" && payment.data && payment.data.id) {
      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${payment.data.id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
          },
        }
      );
      const mpData = await mpResponse.json();

      if (mpData.status === "approved") {
        const meta = mpData.metadata || {};
        let data = {};

        if (meta.tipo === "individual") {
          data = {
            tipo: meta.tipo,
            nome: meta.nome,
            idade: meta.idade,
            email: meta.email,
            whatsapp: meta.whatsapp,
            profissao: meta.profissao,
            empresa: meta.empresa,
            paymentId: mpData.id,
            valor: mpData.transaction_amount,
            status: mpData.status,
          };
        } 
        else if (meta.tipo === "socios") {
          data = {
            tipo: meta.tipo,
            nomeSocio1: meta.nomeSocio1,
            idadeSocio1: meta.idadeSocio1,
            idadeSocio2: meta.idadeSocio2,
            nomeSocio2: meta.nomeSocio2,
            emailSocio1: meta.emailSocio1,
            emailSocio2: meta.emailSocio2,
            whatsappSocio1: meta.whatsappSocio1,
            whatsappSocio2: meta.whatsappSocio2,
            profissaoSocio1: meta.profissaoSocio1,
            profissaoSocio2: meta.profissaoSocio2,
            empresa: meta.profissaoSocio1 === "empreendedor" ? meta.empresaSocio : "",
            paymentId: mpData.id,
            valor: mpData.transaction_amount,
            status: mpData.status,
          };
        }
          console.log(mpData.metadata)
        const novoCadastro = new Form(data);
        await novoCadastro.save();

        console.log("✅ Cadastro confirmado e salvo:", novoCadastro);

        // E-mail de confirmação
        await enviarEmailConfirmacao(meta.email, meta.nome);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Erro no webhook:", error);
    res.sendStatus(500);
  }
});


// Rota para buscar pagamento pelo ID
app.get("/api/pagamento/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: "Pagamento não encontrado" });
    }

    const paymentData = await response.json();
    res.json(paymentData);
  } catch (error) {
    console.error("Erro ao buscar pagamento:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// Páginas simples para sucesso, falha e pendente
app.get("/sucesso", (req, res) => {
  res.send("<h1>Pagamento aprovado! Obrigado pela sua compra.</h1>");
});

app.get("/falha", (req, res) => {
  res.send("<h1>Pagamento falhou. Tente novamente.</h1>");
});

app.get("/pendente", (req, res) => {
  res.send("<h1>Pagamento pendente. Aguarde a confirmação.</h1>");
});

// Login admin
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const admin = await AdminUser.findOne({ username });
  if (!admin) return res.status(401).json({ message: "Usuário ou senha inválidos" });
   console.log("Senha digitada:", password);
   console.log("Senha no banco (hash):", admin.password);

  const valid = await bcrypt.compare(password, admin.password);

  if (!valid) return res.status(401).json({ message: "Usuário ou senha inválidos" });

  const token = jwt.sign(
    { id: admin._id, username: admin.username },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({ token });
});


app.get("/api/admin/dashboard", verifyAdminToken, async (req, res) => {
  try {
    const { search } = req.query;

    let filtro = {};
    if (search && search.trim() !== "") {
      filtro = {
        $or: [
          { nome: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { whatsapp: { $regex: search, $options: "i" } }
        ]
      };
    }

    const inscritos = await Form.find(filtro).lean();

    res.json({
      message: "Acesso autorizado ao dashboard",
      admin: req.admin,
      inscritos,
    });
  } catch (error) {
    console.error("Erro ao buscar inscritos:", error);
    res.status(500).json({ error: "Erro ao buscar inscritos" });
  }
});




app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// *?MIDDLEWARE
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());
app.use(cookieParser());
// *? jwt middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized Access!" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden Access!" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.plfcipz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("You successfully connected to MongoDB!");

    // *?JWT added
    const cookieOption = {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    };
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "12h",
      });
      res.cookie("token", token, cookieOption);
      res.send({ Success: true });
    });
    app.get("/logout", async (req, res) => {
      try {
        res.clearCookie("token", { ...cookieOption, maxAge: 0 });
        res.send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });
    // *?JWT End
    // *? DataBase Collections :
    const usersCollection = client.db("PRB9-A12").collection("users");
    const parcelsCollection = client.db("PRB9-A12").collection("parcels");

    //  ** verify Admin & DeliveryMan middleware
    const verifyAdmin = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "admin")
        return res.status(401).send({ message: "unauthorized access!!" });
      next();
    };
    const verifydeliveryMan = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "deliveryMan") {
        return res.status(401).send({ message: "unauthorized access!!" });
      }
      next();
    };

    // ** All CRUD Operated --
    //  *? Add User Details in DB from Registration
    app.put("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });
    //  *? Add User Details in DB from SocialLogin
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      try {
        const existingUser = await usersCollection.findOne({ query });
        if (!existingUser) {
          const newUser = {
            ...user,
            timestamp: Date.now(),
          };
          const result = await usersCollection.insertOne(newUser);
          res.status(201).send(result);
        } else {
          res.status(400).send({ message: "User already exists" });
        }
      } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).send("Internal server error");
      }
    });
    //  *? Get User Details from DB
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      if (email && typeof email === "string") {
        const mail = email.toLowerCase();
        const result = await usersCollection.findOne({
          email: mail,
        });
        console.log(result);
        if (result) {
          res.status(200).send(result);
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } else {
        res.status(400).send({ message: "Invalid email" });
      }
    });
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Parcel Management is running");
});
app.listen(port, () => {
  console.log(`Parcel Management is running On Port ${port}`);
});

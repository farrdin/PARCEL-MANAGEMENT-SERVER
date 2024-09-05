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
    return res.status(401).send({ message: "Unauthorized Access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized Access" });
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
        expiresIn: "1h",
      });
      res.cookie("token", token, cookieOption);
      res.send({ Success: true });
    });
    app.post("/logout", async (req, res) => {
      const user = req.body;
      res.clearCookie("token", { ...cookieOption, maxAge: 0 });
      res.send({ success: true });
    });
    // *?JWT End
    // *? DataBase Collections :
    const usersCollection = client.db("PRB9-A12").collection("users");
    const bookedCollection = client.db("PRB9-A12").collection("booked");

    //  ** verify Admin & DeliveryMan middleware
    const verifyAdmin = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      // todo: Add Correct Collection name here
      const result = await "collectionName".findOne(query);
      if (!result || result?.role !== "admin")
        return res.status(401).send({ message: "unauthorized access!!" });

      next();
    };
    const verifydeliveryMan = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      // todo: Add Correct Collection name here
      const result = await "collectionName".findOne(query);
      if (!result || result?.role !== "deliveryMan") {
        return res.status(401).send({ message: "unauthorized access!!" });
      }
      next();
    };

    // ** All CRUD Operated --

    //  *? Add User Details in DB
    app.put("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      // check if user already exists in db
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        if (user.role === "Requested") {
          // if existing user try to change his role
          const result = await users.updateOne(query, {
            $set: { status: user?.role },
          });
          return res.send(result);
        } else {
          // if existing user login again
          return res.send(isExist);
        }
      }
      // save user for the first time
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      // welcome new user
      // sendEmail(user?.email, {
      //   subject: "Welcome to Stayvista!",
      //   message: `Hope you will find you destination`,
      // });
      // res.send(result);
    });
    //  *? Get User Details from DB
    app.get("/users", async (req, res) => {
      const items = usersCollection.find();
      const result = await items.toArray();
      res.send(result);
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
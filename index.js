require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_KEY);
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
    // *? Stipe Payment Added
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;
      if (!price || priceInCent < 1) return;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.send({ clientSecret: client_secret });
    });
    // *? DataBase Collections :
    const usersCollection = client.db("PRB9-A12").collection("users");
    const parcelsCollection = client.db("PRB9-A12").collection("parcels");
    const reviewsCollection = client.db("PRB9-A12").collection("reviews");

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
    // *? Get all User By admin
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    //  *? Get User Details from DB
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email && typeof email === "string") {
        const mail = email.toLowerCase();
        const result = await usersCollection.findOne({
          email: mail,
        });
        if (result) {
          res.status(200).send(result);
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } else {
        res.status(400).send({ message: "Invalid email" });
      }
    });
    // *? Update Role by Admin
    app.patch(
      "/users/update/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { role } = req.body;
        if (!role) {
          return res.status(400).send({ message: "Role is required" });
        }
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { role },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "User not found or role unchanged" });
        }
        res.send({ message: "User role updated successfully", result });
      }
    );
    // *? Post Parcel Bookings
    app.post("/parcels", verifyToken, async (req, res) => {
      const bookParcel = req.body;
      const result = await parcelsCollection.insertOne(bookParcel);
      res.send(result);
    });
    // *? Get parcel details by user email
    app.get("/parcels/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await parcelsCollection.find(query).toArray();
      res.send(result);
    });
    // *? Update Parcel status By user,admin,deliveryMan
    app.patch("/parcels/update/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const userMail = req.user.email;
      const updatedData = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updatedData,
      };
      try {
        const result = await parcelsCollection.updateOne(filter, updateDoc);
        if (result.modifiedCount > 0) {
          if (updatedData.status === "Delivered" && userMail) {
            await usersCollection.updateOne(
              { email: userMail },
              { $inc: { deliveryCount: 1 } }
            );
          }
          res
            .status(200)
            .send({ success: true, message: "Parcel updated successfully" });
        } else {
          res.status(404).send({ success: false, message: "Parcel not found" });
        }
      } catch (error) {
        console.error("Backend error:", error);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });
    // *? Cancel Parsel Status by user
    app.patch("/parcels/cancel/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: "Cancelled" },
      };
      const result = await parcelsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // *? Get all Booked parcel By admin
    app.get("/parcels", verifyToken, verifyAdmin, async (req, res) => {
      const result = await parcelsCollection.find().toArray();
      res.send(result);
    });
    // *? Get DeliveryList of Assigned delivery Man
    app.get("/parcels-assigned", verifyToken, async (req, res) => {
      const userMail = req.user.email;
      const query = { assigned: userMail };
      try {
        const result = await parcelsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Failed to fetch user-specific parcels", error);
        res.status(500).send({ error: "Failed to fetch parcels" });
      }
    });
    // *? post All reviews to reviewsCollection
    app.post("/reviews", verifyToken, async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });
    // *? Get Reviews  by deliveryMan email
    app.get("/reviews/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { deliverMail: email };
      const result = await reviewsCollection.find(query).toArray();
      res.send(result);
    });
    // *? Calculate average review for DeliveryMan
    app.get("/delivery-men", verifyToken, async (req, res) => {
      try {
        const deliveryMen = await usersCollection
          .find({ role: "deliveryMan" })
          .toArray();
        const deliveryMenWithRatings = await Promise.all(
          deliveryMen.map(async (deliveryMan) => {
            const reviews = await reviewsCollection
              .find({ deliverMail: deliveryMan.email })
              .toArray();
            const totalRatings = reviews.reduce(
              (acc, review) => acc + review.rating,
              0
            );
            const averageRating =
              reviews.length > 0 ? totalRatings / reviews.length : 0;
            return {
              ...deliveryMan,
              averageRating: parseFloat(averageRating.toFixed(1)),
            };
          })
        );
        res.send(deliveryMenWithRatings);
      } catch (error) {
        console.error(
          "Failed to get delivery men with average ratings:",
          error
        );
        res
          .status(500)
          .send({ error: "Failed to get delivery men with average ratings" });
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

const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nycnjuh.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const eTuitionsDB = client.db("eTuitionsBD");
const usersCollection = eTuitionsDB.collection("users");
const tutorsCollection = eTuitionsDB.collection("tutors");

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // users related api

    app.get('/users/:email',async(req,res)=>{
      const email = req.params.email;
      const query ={email}
      const result = await usersCollection.findOne(query);
      res.send(result);

    })
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const query = { email: newUser.email };

      const userExist = await usersCollection.findOne(query);
      if (userExist) {
        return res.send({ message: "user already exists!" });
      }

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // tutors related api
    app.get("/tutors", async (req, res) => {
      const cursor = tutorsCollection.find({});
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/topTutors", async (req, res) => {
      const topTutors = await tutorsCollection
        .find()
        .sort({ joinDate: -1 })
        .limit(6)
        .toArray();
      res.send(topTutors);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("hello from eTuitionsBD server");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

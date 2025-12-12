const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const serviceAccount = require("./e-tuition-bd-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyFbToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access!" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decodedEmail = decoded.email;

    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized access!" });
  }
};

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
const tuitionsCollection = eTuitionsDB.collection("tuitions");
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // users related api

    app.get("/users",verifyFbToken, async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.send(users);
    });

    app.get("/users/:email/role",verifyFbToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    
    app.get("/users/:email/profile",verifyFbToken, async (req, res) => {
      const { email } = req.params;

      const query = { email };
      if (email) {

        if (email !== req.decodedEmail) {
          return res.status(403).send({ message: "Forbidden access!" });
        }
      }

      const user = await usersCollection.findOne(query);
      res.send(user);
    });
    app.patch("/users/:email/profile",verifyFbToken, async (req, res) => {
      const { email } = req.params;
      const query = { email };
      const profileData = req.body;

      const updatedProfile = {
        $set: {
          photo: profileData.photo,
          phone: profileData.phone,
          "profile.gender": profileData.gender,
          "profile.qualification": profileData.qualification,
          "profile.experience": profileData.experience,
          "profile.teachingSubject": profileData.teachingSubject,
          "profile.expectedSalary": profileData.expectedSalary,
          "profile.location": profileData.location,
          "profile.profileStatus": "complete",
        },
      };

      const result = await usersCollection.updateOne(query, updatedProfile);
      res.send(result);
    });

    app.post("/users",verifyFbToken, async (req, res) => {
      const newUser = req.body;

      const query = { email: newUser.email };

      const userExist = await usersCollection.findOne(query);
      if (userExist) {
        return res.send({ message: "user already exists!" });
      }

      newUser.profile = {
        profileStatus: "incomplete",
        approvalStatus: "pending",
        joinDate: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // tutors related api
    app.get("/users/tutors",verifyFbToken, async (req, res) => {
      const query = { role: "tutor" };
      const cursor = usersCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/topTutors", async (req, res) => {
      const query = { role: "tutor" };
      const topTutors = await usersCollection
        .find(query)
        .sort({ joinDate: -1 })
        .limit(6)
        .toArray();
      res.send(topTutors);
    });

    // admin related routes
 app.patch("/admin/users/:id/role", verifyFbToken, async (req, res) => {
   const { id } = req.params;
   const { role } = req.body;

   const updatedRole = {
     $set: { role },
   };

   const result = await usersCollection.updateOne(
     { _id: new ObjectId(id) },
     updatedRole
   );
   res.send(result);
 });
 app.patch("/admin/users/:id/status", verifyFbToken, async (req, res) => {
   const { id } = req.params;
   const { approvalStatus } = req.body;

   const updatedStatus = {
     $set: { "profile.approvalStatus": approvalStatus },
   };

   const result = await usersCollection.updateOne(
     { _id: new ObjectId(id) },
     updatedStatus
   );

   res.send(result);
 });

  app.patch("/admin/tuitions/:id/status", verifyFbToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const updatedStatus = {
      $set: { status },
    };
    const result = await tuitionsCollection.updateOne(
      { _id: new ObjectId(id) },
      updatedStatus
    );
    res.send(result);
  });

    // tuitions related api.
   
    app.get("/tuitions", async (req, res) => {
      const email = req.query.email;
      const isAdmin = req.query.admin === "true";

      let query = {};

      if (isAdmin) {
        query = {};
      } else if (email) {
        query.postedBy = email;
      } else {
        query.status = "Approved";
      }

      const result = await tuitionsCollection
        .find(query)
        .sort({ postedAt: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/tuitions/:id/details", verifyFbToken,async (req, res) => {
      const { id } = req.params;
      const query = {};
      if (id) {
        query._id = new ObjectId(id);
      }
      const result = await tuitionsCollection.findOne(query);
      res.send(result);
    });

    app.post("/tuitions",verifyFbToken, async (req, res) => {
      const newTuition = req.body;
      if (newTuition) {
        newTuition.postedDate = new Date();
      }
      const result = await tuitionsCollection.insertOne(newTuition);
      res.send(result);
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

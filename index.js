const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const serviceAccount = require("./e-tuition-bd-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const port = process.env.PORT || 5000;

const generateTrackingId = () => {
  const prefix = "ETB-APP";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();

  return `${prefix}-${date}-${random}`;
};

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
const applicationsCollection = eTuitionsDB.collection("applications");
const paymentsCollection = eTuitionsDB.collection("payments");

// verify admin middleware
const verifyAdmin = async (req, res, next) => {
  const email = req.decodedEmail;
  const query = { email };
  const user = await usersCollection.findOne(query);

  if (!user || user.role !== "admin") {
    return res.status(403).send({ message: "forbidden access" });
  }

  next();
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // users related api

    app.get("/users", verifyFbToken, async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.send(users);
    });

    app.get("/users/:email/role", verifyFbToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.get("/users/:email/profile", verifyFbToken, async (req, res) => {
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
    app.patch("/users/:email/profile", verifyFbToken, async (req, res) => {
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

    app.post("/users", verifyFbToken, async (req, res) => {
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
    app.get("/users/tutors", verifyFbToken, async (req, res) => {
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

    // tuitions related api.

    // all tuitions for public
    app.get("/tuitions", async (req, res) => {
      const query = { status: "Approved" };

      const result = await tuitionsCollection
        .find(query)
        .sort({ postedDate: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/my-tuitions", verifyFbToken, async (req, res) => {
      const email = req.decodedEmail;

      const student = await usersCollection.findOne({ email });
      if (!student) {
        return res.status(404).send({ message: "User not found" });
      }

      const result = await tuitionsCollection
        .find({ studentId: student._id })
        .sort({ postedDate: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/tuitions/:id/details", verifyFbToken, async (req, res) => {
      const { id } = req.params;
      const query = {};
      if (id) {
        query._id = new ObjectId(id);
      }
      const result = await tuitionsCollection.findOne(query);
      res.send(result);
    });

    app.patch("/tuitions/:id/edit", verifyFbToken, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const data = req.body;

      const updatedDoc = {
        $set: {
          title: data.title,
          salary: data.salary,
          daysPerWeek: data.daysPerWeek,
        },
      };

      const result = await tuitionsCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    app.delete("/tuitions/:id/delete", verifyFbToken, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await tuitionsCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/tuitions", verifyFbToken, async (req, res) => {
      const newTuition = req.body;
      const decodedEmail = req.decodedEmail;

      const student = await usersCollection.findOne({ email: decodedEmail });
      if (!student) {
        return res.status(404).send({ message: "user not found!" });
      }
      const insertTuition = {
        ...newTuition,
        studentId: student._id,
        postedDate: new Date(),
      };
      const result = await tuitionsCollection.insertOne(insertTuition);
      res.send(result);
    });

    // applications related apis

    app.get("/applications", verifyFbToken, async (req, res) => {
      const userEmail = req.decodedEmail;
      const user = await usersCollection.findOne({ email: userEmail });
      const userId = user._id;
      const query = {};
      if (user.role === "tutor") {
        query.tutorId = userId;
      }
      if (user.role === "student") {
        query.studentId = userId;
      }

      const applications = await applicationsCollection.find(query).toArray();
      res.send(applications);
    });

    app.post("/applications", verifyFbToken, async (req, res) => {
      const newApplication = req.body;
      const tutorEmail = req.decodedEmail;
      const tuitionId = new ObjectId(newApplication.tuitionId);

      const tutor = await usersCollection.findOne({ email: tutorEmail });
      const tuition = await tuitionsCollection.findOne({ _id: tuitionId });

      if (!tutor || tutor.role !== "tutor") {
        return res.status(403).send({ message: "Only tutors can apply" });
      }

      if (!tuition || tuition.status.toLowerCase() !== "approved") {
        return res.status(400).send({ message: "Tuition not available" });
      }

      newApplication.tutorId = tutor._id;
      newApplication.tutorName = tutor.name;
      newApplication.studentId = tuition.studentId;
      newApplication.status = "pending";
      newApplication.paymentStatus = "unpaid";
      newApplication.tuitionId = tuition._id;
      newApplication.tuitionTitle = tuition.title;
      newApplication.createdAt = new Date();

      const result = await applicationsCollection.insertOne(newApplication);

      console.log("hello from app: ", result);
      res.send(result);
    });

    app.get("/applications/:id", verifyFbToken, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const application = await applicationsCollection.findOne(query);
      res.send(application);
    });

    // update application status from student profile
    app.patch(
      "/applications/:id/update-status",
      verifyFbToken,
      async (req, res) => {
        const { id } = req.params;
        const { status: newStatus } = req.body;
        const query = {
          _id: new ObjectId(id),
        };
        const updatedApplication = {
          $set: { status: newStatus },
        };

        const result = await applicationsCollection.updateOne(
          query,
          updatedApplication
        );
        res.send(result);
      }
    );
    // edit application from tutor profile
    app.patch(
      "/applications/:id/edit-application",
      verifyFbToken,
      async (req, res) => {
        const { id } = req.params;
        const data = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            qualification: data.qualification,
            expectedSalary: data.expectedSalary,
            experience: data.experience,
          },
        };
        const result = await applicationsCollection.updateOne(
          query,
          updatedDoc
        );

        res.send(result);
      }
    );
    app.delete("/applications/:id/delete", verifyFbToken, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };

      const result = await applicationsCollection.deleteOne(query);
      res.send(result);
    });

    // admin related routes
    app.get(
      "/admin/users/:id",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;

        const user = await usersCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user);
      }
    );

    app.patch(
      "/admin/users/:id/role",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    app.patch(
      "/admin/users/:id/profile",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const data = req.body;

        const query = { _id: new ObjectId(id) };

        const updatedDoc = {
          $set: {
            name: data.name,
            phone: data.phone,
            photo: data.photo,

            "profile.gender": data.gender,
            "profile.qualification": data.qualification,
            "profile.experience": data.experience,
            "profile.teachingSubject": data.teachingSubject,
            "profile.expectedSalary": data.expectedSalary,
            "profile.location": data.location,

            "profile.profileStatus": "complete",
            updatedAt: new Date(),
          },
        };

        const result = await usersCollection.updateOne(query, updatedDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({
          success: true,
          message: "User profile updated by admin",
          result,
        });
      }
    );

    app.patch(
      "/admin/users/:id/status",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    app.delete(
      "/admin/users/:id",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;

        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(result);
      }
    );

    app.get("/admin/tuitions", verifyFbToken, verifyAdmin, async (req, res) => {
      const result = await tuitionsCollection.find({}).toArray();
      res.send(result);
    });

    app.patch(
      "/admin/tuitions/:id/status",
      verifyFbToken,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    // payment related apis
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "BDT",
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${paymentInfo.tuitionTitle}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          tuitionId: paymentInfo.tuitionId,
          applicationId: paymentInfo.applicationId,
          studentId: paymentInfo.studentId,
          tutorId: paymentInfo.tutorId,
          email: paymentInfo.email,
          tuitionTitle: paymentInfo.tuitionTitle,
        },
        customer_email: paymentInfo.email,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/student/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/student/payment-cancelled`,
      });
      res.send({ url: session.url });
    });

    app.patch("/payment-success", verifyFbToken, async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // console.log("session: ", session);
      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };

      const paymentExist = await paymentsCollection.findOne(query);

      if (paymentExist) {
        return res.send({
          message: "Payment already exists",
          transactionId,
          trackingId: paymentExist.trackingId,
        });
      }

      const trackingId = generateTrackingId();
      if (session.payment_status === "paid") {
        const id = session.metadata.applicationId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            status: "accepted",
            trackingId: trackingId,
          },
        };
        const result = await applicationsCollection.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customer_email: session.customer_email,
          applicationId: session.metadata.applicationId,
          tuitionTitle: session.metadata.tuitionTitle,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };
        if (session.payment_status === "paid") {
          const resultPayment = await paymentsCollection.insertOne(payment);
          res.send({
            success: true,
            modifyApplication: result,
            trackingId: trackingId,
            transactionId: session.payment_intent,
            paymentInfo: resultPayment,
          });
        }
      }

      res.send({ success: false });
    });

    app.get("/payments", verifyFbToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.customer_email = email;
      }

      const cursor = paymentsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/tutor/revenue", verifyFbToken, async (req, res) => {
      try {
        const tutorEmail = req.decodedEmail;

       
        const tutor = await usersCollection.findOne({
          email: tutorEmail,
          role: "tutor",
        });

        if (!tutor) {
          return res.status(404).send({ message: "Tutor not found" });
        }

        const revenue = await paymentsCollection
          .aggregate([
    
          {
  $addFields: {
    applicationObjId: { $toObjectId: "$applicationId" }
  }
},

         
            {
              $lookup: {
                from: "applications",
                localField: "applicationObjId",
                foreignField: "_id",
                as: "application",
              },
            },

          
            { $unwind: "$application" },

            {
              $match: {
                "application.tutorId": tutor._id,
                paymentStatus: "paid",
              },
            },

       
            {
              $project: {
                _id: 1,
                amount: 1,
                currency: 1,
                tuitionTitle: 1,
                paidAt: 1,
                transactionId: 1,
                trackingId: "$application.trackingId",
              },
            },

           
            { $sort: { paidAt: -1 } },
          ])
          .toArray();

        res.send(revenue);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to load revenue" });
      }
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

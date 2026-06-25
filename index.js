const express = require('express');
const cors = require('cors');
const app = express();
const dotenv = require('dotenv');

app.use(cors());
app.use(express.json());
dotenv.config();

const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB");

    const db = client.db('havenFlow').collection('properties');
    const reviewsCollection = client.db('havenFlow').collection('reviews');
    const userCollection = client.db('havenFlow').collection('user');

    // ১. ফিচার্ড প্রপার্টিজ (সর্বোচ্চ ৬ টি অনুমোদিত প্রপার্টি দেখাবে)
    app.get("/featured-properties", async (req, res) => {
      try {
        const result = await db
          .find({ status: { $regex: /^approved$/i } })
          .limit(6)
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching featured properties:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ২. ফিল্টারিং এবং সার্চিং সহ অল প্রপার্টিজ এন্ডপয়েন্ট
    app.get("/properties", async (req, res) => {
      try {
        const { search, type, minPrice, maxPrice } = req.query;
        let query = { status: { $regex: /^approved$/i } };

        if (search) {
          query.$or = [
            { location: { $regex: search, $options: "i" } },
            { title: { $regex: search, $options: "i" } }
          ];
        }

        if (type) {
          query.propertyType = type;
        }

        if (minPrice || maxPrice) {
          query.rent = {};
          if (minPrice) query.rent.$gte = Number(minPrice);
          if (maxPrice) query.rent.$lte = Number(maxPrice);
        }

        const result = await db.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching properties:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ৩. সিঙ্গেল প্রপার্টি ডিটেইলস
    app.get('/properties/:id', async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Property ID format" });
        }

        const result = await db.findOne({
          _id: new ObjectId(id),
          status: { $regex: /^approved$/i }
        });

        if (!result) {
          return res.status(404).send({ message: "Property not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Error fetching single property:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ৪. রিভিউ সেভ করার জন্য POST API
    app.post("/reviews", async (req, res) => {
      try {
        const reviewData = req.body;
        const result = await reviewsCollection.insertOne(reviewData);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error saving review:", error);
        res.status(500).send({ message: "Failed to save review" });
      }
    });

    // ৫. হোম পেজে রিভিউ দেখানোর জন্য GET API
    app.get("/reviews", async (req, res) => {
      try {
        const result = await reviewsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching reviews" });
      }
    });

    // 🆕 ৬.১ অ্যাডমিন অল প্রপার্টিজ — status filter chara shob property (pending/approved/rejected shob)
    // Public "/properties" route shudhu approved property dey, tai admin panel eta use korle
    // reject/approve korar por reload dile property ta list theke hariye jeto.
    app.get("/admin/properties", async (req, res) => {
      try {
        const result = await db.find().sort({ _id: -1 }).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching all properties for admin:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ৬. অ্যাডমিন অল ইউজার্স পেজ
    app.get("/user", async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching users" });
      }
    });

    // ৭. ইউজারের রোল আপডেট (PATCH)
    app.patch("/user/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { role: role } };

        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error updating user role" });
      }
    });

    /**
     * 🟢 ৮. PROPERTY STATUS UPDATE ROUTE
     * Approve / Reject — kono case e document delete hoy na, shudhu status field update hoy.
     */
    app.patch('/property/status/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { status, rejectionTitle, rejectionFeedback } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        let updateDoc = {
          $set: { status: status }
        };

        if (status === 'Rejected') {
          updateDoc.$set.rejectionTitle = rejectionTitle || "";
          updateDoc.$set.rejectionFeedback = rejectionFeedback || "";
        } else {
          updateDoc.$unset = { rejectionTitle: "", rejectionFeedback: "" };
        }

        const result = await db.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating property status:", error);
        res.status(500).send({ message: "Server Error", error: error.message });
      }
    });

    // 🚫 ৯. PROPERTY DELETE ROUTE — INTENTIONALLY REMOVED
    // Assignment requirement: "No Property will be Delete". Property reject/approve
    // shudhu status update kore, kokhono document remove kore na. Delete route ta
    // notun add korar age, eta requirement-er sathe matche kina double-check koro.

  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('HavenFlow Server is running!')
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});
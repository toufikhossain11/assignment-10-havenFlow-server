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
    // ১. ফিচার্ড প্রপার্টিজ (সর্বোচ্চ ৬ টি অনুমোদিত প্রপার্টি দেখাবে)
    app.get("/featured-properties", async (req, res) => {
      try {
        const result = await db
          .find({ status: "approved" })
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
        let query = { status: "approved" };

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
     app.get('/properties/:id', async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Property ID format" });
        }

        const result = await db.findOne({ _id: new ObjectId(id), status: "approved" });
        
        if (!result) {
          return res.status(404).send({ message: "Property not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Error fetching single property:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    // রিভিউ সেভ করার জন্য POST API
app.post("/reviews", async (req, res) => {
  try {
    const reviewData = req.body;
    
    // ফ্রন্টএন্ড থেকে পাঠানো ডাটা চেক করার জন্য (সার্ভার কনসোলে দেখাবে)
    console.log("Received Review Data:", reviewData);

    // আপনার ডাটাবেজের কালেকশন সিলেক্ট করুন (reviewsCollection আপনার ডিফাইন করা ভ্যারিয়েবল)
    const result = await reviewsCollection.insertOne(reviewData);
    
    res.status(201).send(result);
  } catch (error) {
    console.error("Error saving review:", error);
    res.status(500).send({ message: "Failed to save review" });
  }
});
app.get("/reviews", async (req, res) => {

    const result = await reviewsCollection.find().toArray();
    res.send(result);
})





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
const express = require('express');
const cors = require('cors');
const app = express()
const dotenv = require('dotenv')
app.use(cors())
app.use(express.json())
dotenv.config()
const port = process.env.PORT || 3000  
const uri = process.env.MONGODB_URI;


const { MongoClient, ServerApiVersion } = require('mongodb');

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
    const db = client.db('havenFlow').collection('properties');
    //clint to server connection
   app.get("/featured-properties", async (req, res) => {
    const result = await db
      .find({ status: "approved" })
      .limit(6)
      .toArray();
    res.send(result);
});
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
      query.propertyType = type; // আপনার ডাটাবেজের ফিল্ডের স্পেলিং টাইপ অনুযায়ী 'type' বা 'propertyType' মিলিয়ে নিবেন
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

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
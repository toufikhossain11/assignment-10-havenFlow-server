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

// 🔁 Shared helper — Valid ObjectId check middleware
const validateObjectId = (req, res, next) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: "Invalid ID format" });
  }
  next();
};

async function run() {
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB");

    const db = client.db('havenFlow').collection('properties');
    const reviewsCollection = client.db('havenFlow').collection('reviews');
    const userCollection = client.db('havenFlow').collection('user');
    const bookingsCollection = client.db('havenFlow').collection('bookings');
    const transactionsCollection = client.db('havenFlow').collection('transactions');
    const favoritesCollection = client.db('havenFlow').collection('favorites');

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
    app.get('/properties/:id', validateObjectId, async (req, res) => {
      try {
        const { id } = req.params;
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

    // ৬.১ অ্যাডমিন অল প্রপার্টিজ
    app.get("/admin/properties", async (req, res) => {
      try {
        const result = await db.find().sort({ _id: -1 }).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching all properties for admin:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // 🔥 নতুন প্রপার্টি অ্যাড করার জন্য POST API
    app.post("/properties", async (req, res) => {
      try {
        const propertyData = req.body;
        if (!propertyData.status) {
          propertyData.status = "Pending";
        }
        const result = await db.insertOne(propertyData);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error saving new property:", error);
        res.status(500).send({ message: "Failed to save property to database" });
      }
    });

    // 🔄 ওনারের ইমেইল অনুযায়ী নিজস্ব প্রপার্টিজ পাওয়ার API
    app.get("/my-properties", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res.status(400).send({ message: "Owner email parameter is required" });
        }
        const query = { ownerEmail: email };
        const result = await db.find(query).sort({ _id: -1 }).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching owner properties:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // 🔄 ওনারের নিজস্ব প্রপার্টি এডিট/আপডেট করার API
    app.put("/property/update/:id", validateObjectId, async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            title: updatedData.title,
            description: updatedData.description,
            location: updatedData.location,
            propertyType: updatedData.propertyType,
            rent: `Tk ${updatedData.price}`,
            rentType: updatedData.rentType,
            bedrooms: Number(updatedData.bedrooms),
            bathrooms: Number(updatedData.bathrooms),
            size: Number(updatedData.size),
            amenities: updatedData.amenities,
            status: "Pending"
          }
        };

        const result = await db.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating property details:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // 🔄 ওনারের নিজস্ব প্রপার্টি ডিলিট করার API
    app.delete("/properties/:id", validateObjectId, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await db.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error("Error deleting property from database:", error);
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
    app.patch("/user/role/:id", validateObjectId, async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: role } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error updating user role" });
      }
    });

    // ৮. PROPERTY STATUS UPDATE ROUTE
    app.patch('/property/status/:id', validateObjectId, async (req, res) => {
      try {
        const { id } = req.params;
        const { status, rejectionTitle, rejectionFeedback } = req.body;

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


    // =========================================================================
    // 🔥 FAVORITE SYSTEM ENDPOINTS
    // =========================================================================

    // ১০. অলরেডি ফেভারিট করা আছে কি না চেক করার API
    app.get("/favorites/check", async (req, res) => {
      const { email, propertyId } = req.query;
      if (!email || !propertyId) {
        return res.status(400).send({ message: "Email and propertyId are required" });
      }
      try {
        const query = { userEmail: email, propertyId: propertyId };
        const favoriteItem = await favoritesCollection.findOne(query);

        if (favoriteItem) {
          res.send({ isFavorite: true, favoriteId: favoriteItem._id });
        } else {
          res.send({ isFavorite: false, favoriteId: null });
        }
      } catch (error) {
        console.error("Error checking favorite status:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ১১. ফেভারিট কালেকশনে নতুন ডাটা যোগ করার API
    app.post("/favorites", async (req, res) => {
      const favoriteData = req.body;
      if (!favoriteData.userEmail || !favoriteData.propertyId) {
        return res.status(400).send({ message: "Missing required fields" });
      }
      try {
        const alreadyExist = await favoritesCollection.findOne({
          userEmail: favoriteData.userEmail,
          propertyId: favoriteData.propertyId
        });

        if (alreadyExist) {
          return res.status(400).send({ message: "This property is already in favorites" });
        }

        const result = await favoritesCollection.insertOne(favoriteData);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error saving favorite:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ১২. ফেভারিট থেকে রিমুভ করার API
    app.delete("/favorites/:id", async (req, res) => {
      const id = req.params.id;
      const { email } = req.query;

      if (!email) {
        return res.status(400).send({ message: "User email is required" });
      }

      try {
        let query;
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id), userEmail: email };
        } else {
          query = { propertyId: id, userEmail: email };
        }

        const result = await favoritesCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error deleting favorite:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ১৩. ড্যাশবোর্ডে নির্দিষ্ট ইউজারের সব ফেভারিট লিস্ট দেখানোর API
    app.get("/favorites", async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res.status(400).send({ message: "Email parameter is required" });
      }
      try {
        const query = { userEmail: email };
        const result = await favoritesCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching favorites list:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });


    // =========================================================================
    // 🔥 BOOKING SYSTEM ENDPOINTS (FIXED DUPPLICATION)
    // =========================================================================

    // ১৪. ওনার ও টেন্যান্টের বুকিং লিস্ট দেখানোর ইউনিক রুট
    // এই একটি রুটই ফ্রন্টএন্ডের সকল প্রকার ফিল্টারিং (ownerEmail / tenantEmail / email) হ্যান্ডেল করবে
    // ১৪. ওনার ও টেন্যান্টের বুকিং লিস্ট দেখানোর অপ্টিমাইজড রুট
    // ১৪. সব বুকিং ডাটা ফিল্টারিং ছাড়া একসাথে পাওয়ার ইউনিক রুট
    app.get("/bookings", async (req, res) => {
      try {
        // কোনো ইমেইল ফিল্টার নেই, সরাসরি সব ডাটা চলে যাবে ফ্রন্টএন্ডে
        const result = await bookingsCollection.find({}).sort({ _id: -1 }).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching all bookings:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ১৫. OWNER-ER APPROVE/REJECT ACTION
    app.patch("/bookings/status/:id", validateObjectId, async (req, res) => {
      try {
        const { id } = req.params;
        const { bookingStatus } = req.body;

        if (!["Approved", "Rejected"].includes(bookingStatus)) {
          return res.status(400).send({ message: "Invalid status value" });
        }

        const result = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { bookingStatus } }
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating booking status:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ১৬. PAYMENT-SUCCESS HOLE BOOKING + TRANSACTION DOCUMENT INSERT
    app.post("/bookings", async (req, res) => {
      try {
        const data = req.body;

        if (!data.transactionId || !data.propertyId) {
          return res.status(400).send({ message: "transactionId and propertyId are required" });
        }

        const existing = await bookingsCollection.findOne({ transactionId: data.transactionId });
        if (existing) {
          return res.status(200).send({ booking: existing, alreadyExists: true });
        }

        const bookingDoc = {
          propertyId: data.propertyId,
          propertyTitle: data.propertyTitle || "",
          propertyImage: data.propertyImage || "",
          ownerId: data.ownerId || "",
          ownerName: data.ownerName || "",
          ownerEmail: data.ownerEmail || "",
          tenantId: data.tenantId || "",
          tenantName: data.tenantName || "",
          tenantEmail: data.tenantEmail || "",
          moveInDate: data.moveInDate || "",
          contactNumber: data.contactNumber || "",
          additionalNotes: data.additionalNotes || "",
          bookingAmount: Number(data.bookingAmount || 0),
          paymentStatus: "Paid",
          bookingStatus: "Pending",
          transactionId: data.transactionId,
          bookingDate: new Date().toISOString(),
        };

        const transactionDoc = {
          transactionId: data.transactionId,
          propertyId: data.propertyId,
          propertyTitle: data.propertyTitle || "",
          tenantName: data.tenantName || "",
          tenantEmail: data.tenantEmail || "",
          ownerName: data.ownerName || "",
          ownerEmail: data.ownerEmail || "",
          amount: Number(data.bookingAmount || 0),
          paymentMethod: "Stripe",
          paymentStatus: "Paid",
          paymentDate: new Date().toISOString(),
        };

        const bookingResult = await bookingsCollection.insertOne(bookingDoc);
        await transactionsCollection.insertOne(transactionDoc);

        res.status(201).send({ bookingId: bookingResult.insertedId, booking: bookingDoc });
      } catch (error) {
        console.error("Error creating booking:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

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
/**
 * Model imports.
 */
const Product = require("../../models/product.model");
const User = require("../../models/user.model");
const Bid = require("../../models/bid.model");

/**
 * Utils imports.
 */
const catchAsync = require("../../utils/catchAsync");
const {
    cloudinary
} = require("../../utils/cloudinaryUpload");
const AppError = require("../../utils/AppError");
const { convertTZ } = require("../../utils/convertTZ")

/**
 * Get all products from the database
 */
module.exports.getAllProduct = catchAsync(async (req, res) => {
    const products = await Product.find({});
    res.render("products/index", {
        products,
    });
});

/**
 * Get only one product based on product id.
 */
module.exports.getOneProduct = catchAsync(async (req, res) => {
    const product = await Product.findById(req.params.id)
        .populate("user", "_id, firstName")
        .populate({
            path: "currentHighestBid",
            populate: {
                path: "user",
                select: {
                    _id: 1,
                    firstName: 1,
                    lastName: 1,
                    email: 1,
                },
            },
        });
  

    if (!product) {
        req.flash("error", "Product not found");
        return res.redirect("/products");
    }
    res.render("products/product", {
        product,
    });
});

/**
 * Adds a new product to the database.
 */
module.exports.addNewProduct = catchAsync(async (req, res) => {
    const user = req.user;

    const {
        title,
        description,
        basePrice,
        category,
        startTime,
        duration
    } =
    req.body;

    console.log("🐞 ----------------------------------------------------------------------------------------------------------🐞")
    console.log("🐞 ~ file: product.controller.js ~ line 71 ~ module.exports.addNewProduct=catchAsync ~ startTime", startTime, typeof startTime)
    console.log("🐞 ----------------------------------------------------------------------------------------------------------🐞")

    // Validation
    if (!title || !description || !basePrice || !category || !startTime || !duration) {
        req.flash("error", "Please fill all the fields");
        return res.redirect("/products/new");
    }

    if(title.length < 3 || title.length > 280) {
        req.flash("error", "Title should be between 3 and 280 characters");
        return res.redirect("/products/new");
    }

    if(description.length < 10 || description.length > 1000) {
        req.flash("error", "Description should be between 10 and 1000 characters");
        return res.redirect("/products/new");
    }

    // 1. Creating the new product.
    const product = new Product(req.body);
    console.log("🐞 ------------------------------------------------------------------------------------------------------🐞")
    console.log("🐞 ~ file: product.controller.js ~ line 91 ~ module.exports.addNewProduct=catchAsync ~ product", product)
    console.log("🐞 ------------------------------------------------------------------------------------------------------🐞")

    // 2. Saving the images data to the images property of the product
    product.images = req.files.map((file) => ({
        path: file.path,
        filename: file.filename,
    }));

    // 3. Associate the product with the user.
    product.user = req.user._id;

    // 4. Associating the user with the product.
    user.products.push(product._id);

    // 5. Setting the auction status based on time.
    let today = new Date(); 
    today = today.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    today = new Date(today);
    console.log("🐞 ---------------------------------------------------------------------------------------------------🐞")
    console.log("🐞 ~ file: product.controller.js ~ line 109 ~ module.exports.addNewProduct=catchAsync ~ today", today, today.getHours(), today.getMinutes())
    console.log("🐞 ---------------------------------------------------------------------------------------------------🐞")
    
    const endTime = product.endTime;
    console.log("🐞 -------------------------------------------------------------------------------------------------------🐞")
    console.log("🐞 ~ file: product.controller.js ~ line 118 ~ module.exports.addNewProduct=catchAsync ~ endTime", endTime, endTime.getHours(), endTime.getMinutes())
    console.log("🐞 -------------------------------------------------------------------------------------------------------🐞")
 
    if(product.startTime <= today && endTime >= today){
        console.log("Auction is running");
        product.auctionStatus = true;
    } else {
        console.log("Auction is not running");
        product.auctionStatus = false;
    };

    console.log("🐞 ---------------------------------------------------------------------------------------------------------------------------🐞")
    console.log("🐞 ~ file: product.controller.js ~ line 123 ~ module.exports.addNewProduct=catchAsync ~ product.startTime", product.startTime, typeof product.startTime)
    console.log("🐞 ---------------------------------------------------------------------------------------------------------------------------🐞")

    console.log("🐞 -------------------------------------------------------------------------------------------------------🐞")
    console.log("🐞 ~ file: product.controller.js ~ line 122 ~ module.exports.addNewProduct=catchAsync ~ product", product)
    console.log("🐞 -------------------------------------------------------------------------------------------------------🐞")

    // 6. Saving the product to the database and the updated user.
    await Promise.all([product.save(), user.save()]);

    req.flash("success", "Product added successfully.");

    res.redirect(`/products/${product._id}`);
});

/**
 * Render the product edit page.
 */
module.exports.renderEditProduct = catchAsync(async (req, res) => {
    const {
        id
    } = req.params;
    const product = await Product.findById(id);
    res.render("products/edit", {
        product
    });
});

/**
 * Updates the product based on its id.
 */
module.exports.updateProduct = catchAsync(async (req, res) => {
    const {
        id
    } = req.params;
    const product = await Product.findById(id);

    // Check what fields are changed and need to be updated.
    let query = {
        $set: {}
    };
    for (let key in req.body) {
        if (product[key] && product[key] !== req.body[key]) {
            query.$set[key] = req.body[key];
        }
    }
    
    // Check if start time or duration were changed
    if (query.$set.startTime || query.$set.duration) {
        const today = new Date();
        let startTimeInSeconds;

        if(query.$set.startTime) startTimeInSeconds = new Date(query.$set.startTime).getTime() / 1000;
        else startTimeInSeconds = product.startTime.getTime() / 1000;
        
        const endTimeInSeconds = startTimeInSeconds + Number(query.$set.duration) * 24 * 60 * 60;
        const endTime = new Date(endTimeInSeconds * 1000);

        if(new Date(query.$set.startTime) <= today && endTime >= today){
            query.$set.auctionStatus = true;
        } else {
            query.$set.auctionStatus = false;
        }
    }

    // Check if there are any images to be deleted
    if (req.body.deleteImages?.length) {
        const {
            deleteImages
        } = req.body;
        
        // If the number of images being deleted is equal
        // to total number of available images then prevent
        // from deleting all images.
        if(deleteImages.length === product.images.length){
            req.flash("error", "Cannot delete all images");
            return res.redirect(`/products/${product._id}/edit`);
        }

        // Delete the images from the cloudinary.
        await Promise.all(
            deleteImages.map((filename) => cloudinary.uploader.destroy(filename))
        );
        // Delete the images from the product.
        product.images = product.images.filter(image => {
            if(!deleteImages.includes(image.filename)) return image;
        });
    }

    // Check if there are any images to be added
    if (req.files.length > 0) {
        product.images = [...product.images, ...req.files.map((file) => ({
            path: file.path,
            filename: file.filename,
        }))];
    }

    // Running the update query parallely togeather.
    await Promise.all([
        Product.findByIdAndUpdate(id, query["$set"]),
        product.save()
    ]);

    return res.redirect(`/products/${id}`);
});

/**
 * Deletes the product based on its id.
 */
module.exports.deleteProduct = catchAsync(async (req, res) => {
    //1. Get product id from the params.
    const {
        id
    } = req.params;

    //2. Find the product by its id.
    const product = await Product.findById(id);
    //3. Check if the product exists.
    if (!product) throw new AppError("Product not found", 404);

    //4. Delete the product from the database
    await Product.findByIdAndDelete(id);

    //5. Delete the images from the cloudinary if it exists on cloudinary.
    try {
        await Promise.all(
            product.images.map((image) => cloudinary.uploader.destroy(image.filename))
        );
    } catch (e) {
        req.flash("success", "Product deleted successfully.");
        return res.redirect("/products");
    }

    //6. Flash success message.
    req.flash("success", "Product deleted successfully.");

    //7. Redirect to products page.
    return res.redirect("/products");
});

/**
 * @description - This function is used to declare the winner and save it to db.
 * 
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * 
 */
module.exports.declareWinner = catchAsync(async (req, res) => {
   
    const { id: productId } = req.params;
    const { amount, userId, bidId } = req.body;

    if(!amount || !userId || !bidId){
        return res.send({
            msg: "Invalid request"
        })
    }

    const product = await Product.findById(productId);

    if(!product) throw new AppError("Product not found", 404);

    if(product.auctionStatus === false){
        return res.send({
            status: false,
            msg: "Auction is not running"
        })
    }

    const [user, bid] = await Promise.all([
        User.findById(userId),
        Bid.findById(bidId),
    ]);

    if(!user || !bid) throw new AppError("Invalid informations", 404);

    product.auctionStatus = false;
    user.bidsWon.push(bidId);

    await Promise.all([
        product.save(),
        user.save()
    ]);

    return res.send({
        status: true,
        msg: "Winner is declared successfully."
    });

});

/**
 * @description - This function renders the checkout page.
 * 
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 */
module.exports.renderCheckout = (req, res) => {
    const product = req.product;
    const user = req.user;
    const { billingAddress = false, shippingAddress = false } = user.address;

    res.render("products/checkout", {
        product,
        user,
        billingAddress,
        shippingAddress
    })
};
import dotenv from 'dotenv';
dotenv.config();


import express from "express";
import bodyParser from "body-parser";
import { MongoClient } from "mongodb";
import { join } from "path";
import { fileURLToPath } from 'url';
import path from 'path';
import bcrypt from 'bcrypt'; // For password hashing
import session from 'express-session'; // For session management
import flash from "connect-flash";

// Recreate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection string from environment variables
const mongoUrl = process.env.MONGODB_URI;
const client = new MongoClient(mongoUrl);

app.use(session({
    secret:'mysecret',
    resave: true,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60, // 1-hour session timeout
        httpOnly: true,
        
    }
}));

// Initialize flash messages
app.use(flash());

// Middleware to make flash messages available in views
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error = req.flash('error');
    next();
});

// Create or get professor's attendance collection

const getAttendanceCollection = (professorName, semester) => {
    if (!professorName || !semester) {
        console.error("Professor name and semester must be defined.");
        throw new Error("Professor name and semester must be defined.");
    }

    const sanitizedProfessorName = professorName.replace(/[^a-zA-Z0-9_]/g, "_"); // Sanitize name
    const sanitizedSemester = semester.replace(/[^a-zA-Z0-9_() ]/g, "_"); // Sanitize semester name
    return db.collection(`attendance_${sanitizedProfessorName}_${sanitizedSemester}`); // Include semester
};

// MongoDB connection
await client.connect(); // Ensure the connection is established before accessing the database
const db = client.db();
const studentsCollection = db.collection("students");
const usersCollection = db.collection("users"); // Collection for users

// Set views directory
app.set('views', join(__dirname, 'views'));
app.set("view engine", "ejs");

// Middleware to check if user is logged in
const isLoggedIn = (req, res, next) => {
    if (!req.session.user) {
        req.flash('error', 'Please log in to access this page.');
        return res.redirect('/home');
    }
    next();
};

app.get('/', (req, res) => {
    if (req.session.user) {
        console.log(`User is logged in as: ${req.session.user.role}`);
        if (req.session.user.role === 'professor') {
            return res.redirect('/index');
        } else if (req.session.user.role === 'student') {
            return res.redirect('/studentlist');
        }
    } else {
        console.log('No user session, rendering home page.');
    
    }
    res.render('home');
});

app.get('/home', (req, res) => {
    res.render('home'); // Render the registration page
});


app.get('/feedbackRead', async(req,res)=>{
    //const feedbackDB = client.db('attendeancedb').collection('feedback');
    
    try {
        const feedbackDB = client.db('attendeancedb').collection('feedback'); // Access the feedback collection directly
        const feedback = await feedbackDB.find().toArray();
        req.flash('error', 'Feedback Read Successfully.');
        res.render('feedbackRead', { feedback: feedback });
    } catch (error) {
        console.error('Error inserting feedback:', error); // More detailed error logging
        req.flash('error', 'Error submitting feedback. Please try again.');
        res.redirect('/home');
    }
     
})

app.get('/AddStudents', (req, res) => {
    res.render('AddStudents'); 
});

app.get('/professorchoice', async (req, res) => {
    // Fetch all users and filter for professors
    const ProfessorInformation = await usersCollection.find({ role: 'professor' }).toArray();
    res.render('professorchoice', { list: ProfessorInformation });
});


// Registration page route
app.get('/register', (req, res) => {
    res.render('registration'); // Render the registration page
});

app.get('/about', (req, res) => {
    res.render('about'); // Render the registration page
});

app.get('/professorlist', isLoggedIn, async (req, res) => {
    const ProfessorName = req.session.user.email;
    const semester = req.session.user.semester;
    const attendanceCollection = getAttendanceCollection(ProfessorName,semester);

    // Get all attendance records for the current professor
    const attendanceRecords = await attendanceCollection.find().toArray();
    if (req.session.user.role === 'professor') {
        return res.render("professorlist", { list: attendanceRecords });
    }
    req.flash('error', 'Unauthorized access.');
    return res.redirect('/home');
});

app.get('/index', isLoggedIn, async (req, res) => {
    const { email, semester, id, name } = req.session.user; // Ensure you are accessing the correct properties

    // Debugging: Log the session data
    console.log("Session Data:", req.session.user);

    // Validate input
    if (!email || !semester) {
        req.flash('error', 'Professor name and semester are required.');
        return res.redirect('/login'); // Redirect to login if session data is missing
    }

    try {
        // Fetch attendance records from the database
        const attendanceCollection = getAttendanceCollection(email, semester);
        const attendanceRecords = await attendanceCollection.find({}).toArray(); // Fetch all records

        // Fetch students added by the professor
        const students = await studentsCollection.find({ createdBy: email, semester }).toArray();

        // Sort attendance records based on roll number
        attendanceRecords.sort((a, b) => {
            const rollA = a.rollno || ''; // Assuming rollno is the correct field name
            const rollB = b.rollno || '';

            // Split into components
            const partsA = rollA.split('-');
            const partsB = rollB.split('-');

            // Compare each part
            for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                const partA = partsA[i] || '';
                const partB = partsB[i] || '';

                // Compare the alphabetic part first
                if (partA !== partB) {
                    if (isNaN(partA) && isNaN(partB)) {
                        return partA.localeCompare(partB); // Sort alphabetically
                    }
                    if (!isNaN(partA) && !isNaN(partB)) {
                        // Compare numeric parts
                        return parseInt(partA) - parseInt(partB); // Sort numerically
                    }
                    // If one part is numeric and the other is not, non-numeric comes first
                    return isNaN(partA) ? 1 : -1;
                }
            }
            return 0; // They are equal
        });

        // Render the attendance list EJS template
        res.render('index', {
            attendanceRecords,
            students, // Pass the students to the view
            Professor: name,
            SemesterName: semester,
            ProfessorId: id, // Pass the professor's ID
            CurrentUserId: id, // Assuming the current user is the same as the professor
            CurrentSemester: semester // Pass the current semester
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred while fetching attendance records.');
        res.redirect('/login'); // Redirect to an appropriate page
    }
});

app.post('/update-student', isLoggedIn, async (req, res) => {
    const { rollno, name, className } = req.body;
    const { email,semester } = req.session.user;

    try {
        const attendanceCollection = getAttendanceCollection(email, semester);

        // Update the student record in the database
        const result = await attendanceCollection.updateOne(
            { rollno: rollno },
            { $set: { name: name, className: className } }
        );

        if (result.modifiedCount === 1) {
            req.flash('success', 'Student updated successfully.');
        } else {
            req.flash('error', 'No student found with that roll number.');
        }
        res.redirect('/index');
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred while updating the student.');
        res.redirect('/index');
    }
});

app.get('/EditStudent', isLoggedIn, async (req, res) => {
    const rollno = req.query.rollno;
    const { email, semester } = req.session.user;

    try {
        const attendanceCollection = getAttendanceCollection(email, semester);
        const student = await attendanceCollection.findOne({ rollno: rollno });

        console.log('Fetched student:', student); // Log the fetched student data

        if (!student) {
            req.flash('error', 'Student not found.');
            return res.redirect('/index');
        }

        res.render('EditStudent', { student });
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred while fetching student details.');
        res.redirect('/index');
    }
});

app.get('/studentlist', isLoggedIn, async (req, res) => {
    // Ensure only students access this route
    if (req.session.user.role !== 'student') {
        req.flash('error', 'Unauthorized access.');
        return res.redirect('/login');
    }

    // Get the student's roll number from the session
    const rollNo = req.session.user.rollno;

    if (!rollNo) {
        req.flash('error', 'No roll number provided.');
        return res.redirect('/login');
    }

    // Prepare an object to store the total attendance for the specified student
    const totalAttendanceCount = {
        rollno: rollNo,
        name: '',
        totalAttendanceCount: 0
    };

    // Fetch all collections in the database (assuming collections are named after professor attendance)
    const collections = await db.listCollections().toArray();

    // Create an array to hold attendance records for sorting
    let allAttendanceRecords = [];

    // Iterate through each collection that represents a professor's attendance
    for (const collectionInfo of collections) {
        if (collectionInfo.name.startsWith('attendance_')) {
            const attendanceCollection = db.collection(collectionInfo.name);
            const attendanceRecords = await attendanceCollection.find({ rollno: rollNo }).toArray();

            // Add the fetched records to the allAttendanceRecords array
            allAttendanceRecords = allAttendanceRecords.concat(attendanceRecords);
        }
    }

    // If no records were found for the student
    if (allAttendanceRecords.length === 0) {
        req.flash('error', 'No attendance records found for the specified roll number.');
        return res.redirect('/login');
    }

    // Log the attendance records for debugging
    console.log("Fetched Attendance Records:", allAttendanceRecords);

    // Aggregate attendance for the specified student
    allAttendanceRecords.forEach(record => {
        if (!totalAttendanceCount.name) {
            totalAttendanceCount.name = record.name; // Assuming the student's name is stored in attendance records
        }
        totalAttendanceCount.totalAttendanceCount += record.attendanceCount || 0;
    });

    // Sort attendance records by date, ensuring attendance exists
    allAttendanceRecords.sort((a, b) => {
        const dateA = a.attendance && a.attendance.length > 0 ? new Date(a.attendance[0].date) : new Date(0);
        const dateB = b.attendance && b.attendance.length > 0 ? new Date(b.attendance[0].date) : new Date(0);
        return dateB - dateA; // Sort in descending order
    });

    // Render the student list page with the student's total attendance
    res.render("studentlist", { student: totalAttendanceCount, attendanceRecords: allAttendanceRecords });
});

app.post('/add-student', isLoggedIn, async (req, res) => {
    if (req.session.user.role !== 'professor') {
        req.flash('error', 'Unauthorized operation.');
        return res.redirect('/login');
    }

    const ProfessorName = req.session.user.email;
    const semester = req.session.user.semester; // Get the semester from the session
    const rollno = req.body.rollno; // Get the roll number from the request body

    // Check if the student already exists
    const existingStudent = await studentsCollection.findOne({ rollno, createdBy: ProfessorName, semester });

    const newStudent = {
        rollno: rollno,
        name: req.body.name,
        className: req.session.user.semester,
        attendanceCount: 0,
        attendance: [],
        createdBy: ProfessorName,
        semester: semester // Store the semester
    };

    if (existingStudent) {
        // If the student exists, update their information
        await studentsCollection.updateOne(
            { rollno, createdBy: ProfessorName, semester },
            { $set: newStudent }
        );
        req.flash('success_msg', 'Student updated successfully.');
    } else {
        // If the student does not exist, insert a new record
        await studentsCollection.insertOne(newStudent);
        req.flash('success_msg', 'Student added successfully.');
    }

    // Also update the attendance collection
    const attendanceCollection = getAttendanceCollection(ProfessorName, semester); // Pass both parameters
    await attendanceCollection.updateOne(
        { rollno, semester },
        { $set: newStudent },
        { upsert: true } // This will insert if the document does not exist
    );

    res.redirect('/index');
});

app.post('/record', isLoggedIn, async (req, res) => {
    if (req.session.user.role !== 'professor') {
        req.flash('error', 'Unauthorized operation.');
        return res.redirect('/professorlogin');
    }

    const ProfessorName = req.session.user.email;
    const semester = req.session.user.semester; // Get the semester from the session

    console.log(`Professor: ${ProfessorName}, Semester: ${semester}`); // Debugging statement

    const attendanceCollection = getAttendanceCollection(ProfessorName, semester); // Pass both parameters
    const rollnos = req.body.rollnos; // Array of roll numbers
    const statuses = req.body.Status; // Array of statuses (Present/Absent)

    console.log("Received Roll Numbers:", rollnos);
    console.log("Received Statuses:", statuses);

    // Validate inputs
    if (!Array.isArray(rollnos) || !Array.isArray(statuses) || rollnos.length !== statuses.length) {
        req.flash('error', 'Invalid attendance data.');
        return res.redirect('/index');
    }

    // Loop through each student and update their attendance
    for (let i = 0; i < rollnos.length; i++) {
        const rollno = rollnos[i];
        const status = statuses[i];

        // Find the student document using rollno to get the _id
        const student = await attendanceCollection.findOne({ rollno });
        console.log(student); // Check the structure of the student document

        if (student) {
            // Prepare the update object
            const update = {
                $push: {
                    attendance: { status, date: new Date().toLocaleDateString() }
                }
            };

            // Increment attendanceCount only if status is "Present"
            if (status === "Present") {
                update.$inc = { attendanceCount: 1 };
            }

            // Debugging: Log the update operation
            console.log(`Updating attendance for Roll No: ${rollno} with status: ${status}`);
            console.log(`Update Object:`, update);

            const result = await attendanceCollection.updateOne(
                { _id: student._id }, // Use _id for the update
                update
            );

            // Debugging: Check if the update was successful
            if (result.modifiedCount > 0) {
                console.log(`Successfully updated attendance for Roll No: ${rollno}.`);
            } else {
                console.log(`No changes made for Roll No: ${rollno}.`);
            }
        } else {
            console.log(`Student with Roll No: ${rollno} not found for semester: ${semester}`);
        }
    }

    req.flash('success_msg', 'Attendance recorded successfully.');
    res.redirect('/index');
});

app.get('/professorlogin',(req,res)=>{
    res.render("professorlogin")
})

app.post('/attendance-remove/:rollno', isLoggedIn, async (req, res) => {
    if (req.session.user.role !== 'professor') {
        req.flash('error', 'Unauthorized operation.');
        return res.status(403).send('Unauthorized operation.');
    }

    const rollno = req.params.rollno;
    const ProfessorName = req.session.user.email;
    const semester = req.session.user.semester;

    try {
        // Access the attendance collection
        const attendanceCollection = getAttendanceCollection(ProfessorName, semester);

        // Attempt to delete the attendance record for the given roll number
        const result = await attendanceCollection.deleteOne({ rollno });

        if (result.deletedCount === 1) {
            console.log(`Attendance record for roll number ${rollno} removed successfully.`);
            req.flash('success_msg', 'Attendance record removed successfully.');
            return res.status(200).send('Attendance removed successfully.');
        } else {
            console.log(`No attendance record found for roll number ${rollno}.`);
            req.flash('error', 'No attendance record found for the given roll number.');
            return res.status(404).send('No attendance record found.');
        }
    } catch (error) {
        console.error('Error removing attendance:', error);
        req.flash('error', 'An error occurred while removing attendance.');
        return res.status(500).send('An error occurred while removing attendance.');
    }
});


app.get('/professorregister', async (req, res) => {
    res.render("professorregister");
});

app.get('/professorlogin', async (req, res) => {
    res.render("professorlogin");
});

app.post('/professorregister', async (req, res) => {
    const { name, email, dob, qualification, password, phone, role } = req.body;
    const existingUserByEmail = await usersCollection.findOne({ email });

    if (existingUserByEmail) {
        req.flash('error', 'Email is already registered.');
        return res.redirect('/professorregister');
    }

    const existingUser  = await usersCollection.findOne({ email }); // Check for existing user by email
    if (existingUser ) {
        req.flash('error', 'User  already exists with this email.');
        return res.redirect('/professorregister');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser  = {
        name,
        email,
        dob,
        qualification,
        password: hashedPassword,
        phone,
        role
    };

    await usersCollection.insertOne(newUser );
    req.flash('success_msg', 'Registration successful. Please log in.');
    res.redirect('/professorlogin');
});

// Registration route (POST)
app.post('/register', async (req, res) => {
    const { name, email, phone, dob, password, role, rollno } = req.body;

    // Check if a user with the provided email or roll number already exists
    const existingUserByEmail = await usersCollection.findOne({ email });
    const existingUserByRollNo = await usersCollection.findOne({ rollno });

    if (existingUserByEmail) {
        req.flash('error', 'Email is already registered.');
        return res.redirect('/register');
    }

    if (existingUserByRollNo) {
        req.flash('error', 'Roll number is already registered.');
        return res.redirect('/register');
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser  = { name, email, phone, dob, password: hashedPassword, role, rollno };

    // Insert the new user into the database
    await usersCollection.insertOne(newUser );
    req.flash('success_msg', 'Registration successful. Please log in.');
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body; // Capture only email and password
    const user = await usersCollection.findOne({ email });

    if (!user) {
        req.flash('error', 'User  not found.');
        req.session.destroy();
        return res.redirect('/login');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        req.flash('error', 'Invalid credentials.');
        req.session.destroy();
        return res.redirect('/login');
    }

    // Set user session properly
    req.session.user = {
        name: user.name,
        role: user.role,
        rollno: user.rollno, // Get roll number from the user object
        semester: user.semester // Get semester from the user object if applicable
    };

    console.log("User  session set:", req.session.user); // Debugging statement

    // Redirect based on role
    if (user.role === 'professor') {
        return res.redirect('/professerSheet');
    } else if (user.role === 'student') {
        return res.redirect('/studentlist');
    }
});

app.post('/professorlogin', async (req, res) => {
    const { email, password, semester } = req.body; // Capture email, password, and semester
    console.log("Received semester:", semester); // Debugging statement

    const user = await usersCollection.findOne({ email });

    // Check if user exists
    if (!user) {
        req.flash('error', 'User  not found.');
        req.session.destroy(); // Clear session if user not found
        return res.redirect('/professorlogin'); // Redirect to professor login
    }

    // Check if password matches
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        req.flash('error', 'Invalid credentials.');
        req.session.destroy(); // Clear session if credentials are invalid
        return res.redirect('/professorlogin'); // Redirect to professor login
    }

    // Set user session properly
    req.session.user = {
        name: user.name,
        role: user.role,
        email: user.email,
        rollno: user.rollno, // Assuming rollno is part of the user object
        semester: semester // Get semester from the form
    };

    console.log("User  session set:", req.session.user); // Debugging statement

    // Fetch attendance collection
    const attendanceCollection = getAttendanceCollection(user.email, semester);

    // Check if the attendance collection exists
    const attendanceExists = await attendanceCollection.countDocuments() > 0;

    if (!attendanceExists) {
        console.log(`No attendance records found for ${user.email} in semester ${semester}.`);
        req.session.attendanceList = []; // Initialize as empty if no records found
    } else {
        const attendanceList = await attendanceCollection.find({}).toArray(); // Fetch attendance data
        req.session.attendanceList = attendanceList; // Store attendance list in session
    }

    // Redirect based on role
    if (user.role === 'professor') {
        return res.redirect('/index'); // Redirect to attendance page
    } else {
        req.flash('error', 'Unauthorized access.'); // Handle unauthorized access
        return res.redirect('/home'); // Redirect to home or appropriate page
    }
});

app.get('/AttendenceRecord', isLoggedIn, async (req, res) => {
    const { name,email, semester } = req.session.user;

    // Validate input
    if (!email || !semester) {
        req.flash('error', 'Professor name and semester are required.');
        return res.redirect('/login'); // Redirect to login if session data is missing
    }

    try {
        // Fetch attendance records from the database
        const attendanceCollection = getAttendanceCollection(email, semester); // Pass both parameters
        const attendanceRecords = await attendanceCollection.find().toArray();

        // Render the attendance list EJS template
        res.render('AttendenceRecord', { attendanceRecords, Professor: name, semester });
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred while fetching attendance records.');
        res.redirect('/login'); // Redirect to an appropriate page
    }
});

app.get('/login', (req, res) => {
    res.render('login'); // Render the login page
});

// Handle logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/home');
 });

// Handle logout with POST request
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/home'); // Redirect after logout
    });
});

// Start the server (Vercel handles this)
const PORT = process.env.PORT; // Use Vercel's port or default to 3000
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import flash from 'connect-flash';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB setup
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('attendeancedb');
const usersCollection = db.collection('users');

const feedbackCollection = db.collection('feedback');
const studentsCollection = db.collection('students');

const getAttendanceCollection = (professorName, semester) => {
    if (!professorName || !semester) {
        console.error("Professor name and semester must be defined.");
        throw new Error("Professor name and semester must be defined.");
    }

    const sanitizedProfessorName = professorName.replace(/[^a-zA-Z0-9_]/g, "_");
    const sanitizedSemester = semester.replace(/[^a-zA-Z0-9_() ]/g, "_");
    return db.collection(`attendance_${sanitizedProfessorName}_${sanitizedSemester}`);
};

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
}));

app.use(flash());

app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error = req.flash('error');
    next();
});

// Routes
app.get('/', (req, res) => {
    res.render('home');
});

app.get('/about', (req, res) => {
    res.render('about');
});

// Render login page
app.get('/login', (req, res) => {
    res.render('login');
});

// Handle login form submission
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await usersCollection.findOne({ email });

    if (!user) {
        req.flash('error', 'User  not found.');
        return res.redirect('/login');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        req.flash('error', 'Invalid credentials.');
        return res.redirect('/login');
    }

    // Set user session properly
    req.session.user = {
        email: user.email,
        role: user.role,
        rollno: user.rollno,
        semester: user.semester
    };

    console.log("User  session set:", req.session.user);

    // Redirect based on role
    if (user.role === 'professor') {
        return res.redirect('/professerSheet');
    } else if (user.role === 'student') {
        return res.redirect('/studentlist');
    }
});



var ProfessorName;

app.post('/professorlogin', async (req, res) => {
    const { email, password, semester } = req.body;
    const user = await usersCollection.findOne({ email });

    ProfessorName=user.name;

    if (!user) {
        req.flash('error', 'User  not found.');
        return res.redirect('/professorlogin');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        req.flash('error', 'Invalid credentials.');
        return res.redirect('/professorlogin');
    }

    req.session.user = {
        email: user.email,
        role: user.role,
        rollno: user.rollno,
        semester: semester // Store the semester from the login form
    };

    return res.redirect(`/professerSheet`);
});

app.get('/professorlogin',(req,res)=>{
    res.render("professorlogin")
});

app.get('/home',(req,res)=>{
    res.render("home")
})

app.get('/success',(req,res)=>{
    res.render("success")
});

app.get('/feedback', (req, res) => {
    res.render("feedback");
});

app.post('/feedback', async (req, res) => {
    const { name, email, address,phone, message } = req.body;
    console.log( name, email,phone, address, message )

    try {
        const feedbackDB = client.db('attendeancedb').collection('feedback'); // Access the feedback collection directly
        await feedbackDB.insertOne({ name, email,phone, address, feedback: message });
        req.flash('success', 'Feedback submitted successfully!');
        res.redirect('/success');
    } catch (error) {
        console.error('Error inserting feedback:', error); // More detailed error logging
        req.flash('error', 'Error submitting feedback. Please try again.');
        res.redirect('/feedback');
    }
});

app.get('/professerSheet', async (req, res) => {
    // Check if user is logged in
    if (!req.session.user || req.session.user.role !== 'professor') {
        req.flash('error', 'You must be logged in as a professor to view this page.');
        return res.redirect('/professorlogin');
    }

    const { email, semester } = req.session.user;

    try {
        // Fetch attendance records from the database
        const attendanceCollection = getAttendanceCollection(email, semester);
        const attendanceRecords = await attendanceCollection.find({}).toArray();

        // Fetch students added by the professor
        const students = await studentsCollection.find({ createdBy: email, semester }).toArray();

        // Sort attendance records based on roll number
        attendanceRecords.sort((a, b) => {
            const rollA = a.rollno || '';
            const rollB = b.rollno || '';

            return rollA.localeCompare(rollB);
        });

        // Render the attendance list EJS template
        res.render('professerSheet', {
            attendanceRecords,
            students,
            Professor: ProfessorName,
            SemesterName: semester,
            ProfessorId: req.session.user.id,
            CurrentUserId: req.session.user.id,
            CurrentSemester: semester
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred while fetching attendance records.');
        res.redirect('/login');
    }
});



app.post('/record', async (req, res) => {
    const rollnos = req.body.rollnos; // Array of roll numbers
    const statuses = req.body.Status; // Array of statuses (Present/Absent)

    const { email, semester } = req.session.user;

    if (!email || !semester) {
        req.flash('error', 'Professor email and semester are required.');
        return res.redirect('/professorlogin');
    }

    if (!Array.isArray(rollnos) || !Array.isArray(statuses) || rollnos.length !== statuses.length) {
        req.flash('error', 'Invalid attendance data.');
        return res.redirect('/professerSheet');
    }

    const attendanceCollection = getAttendanceCollection(email, semester);


    console.log("Received Roll Numbers:", rollnos);
    console.log("Received Statuses:", statuses);

    try {
        for (let i = 0; i < rollnos.length; i++) {
            const rollno = rollnos[i];
            const status = statuses[i];

            const update = {
                $push: {
                    attendance: { status, date: new Date().toLocaleDateString() }
                }
            };

            if (status === 'Present') {
                update.$inc = { attendanceCount: 1 };
            }

            await attendanceCollection.updateOne(
                { rollno },
                { $setOnInsert: { rollno }, ...update },
                { upsert: true }
            );
        }

        req.flash('success_msg', 'Attendance recorded successfully.');
        res.redirect('/professerSheet');
    } catch (error) {
        console.error("Error updating attendance:", error);
        req.flash('error', 'Failed to record attendance.');
        res.redirect('/professorlogin');
    }
});

app.get('/studentlist', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        req.flash('error', 'You must be logged in to view attendance.');
        return res.redirect('/login');
    }

    const rollNo = req.session.user.rollno;
    const totalAttendanceCount = {
        rollno: rollNo,
        name: '',
        totalAttendanceCount: 0
    };

    const collections = await db.listCollections().toArray();

    for (const collectionInfo of collections) {
        if (collectionInfo.name.startsWith('attendance_')) {
            const attendanceCollection = db.collection(collectionInfo.name);
            const attendanceRecords = await attendanceCollection.find({ rollno: rollNo }).toArray();

            attendanceRecords.forEach(record => {
                if (!totalAttendanceCount.name) {
                    totalAttendanceCount.name = record.name;
                }
                totalAttendanceCount.totalAttendanceCount += record.attendanceCount || 0;
            });
        }
    }

    if (!totalAttendanceCount.name) {
        req.flash('error', 'No attendance records found for the specified roll number.');
        return res.redirect('/login');
    }

    res.render("studentlist", { student: totalAttendanceCount });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log('Error destroying session:', err);
            return res.redirect('/');
        }
        res.redirect('/');
    });
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
# University Attendance System

The **University Attendance System** is a web-based application designed to simplify and automate the management of student attendance. It ensures efficiency, transparency, and user-friendliness for professors, students, and university administration.

---
## **Note**
  - Please your local mongodb database connection string to server.js file for running the code file
## **Features**
### 1. Multiple User Roles
- **Admin Panel**:
  - Perform CRUD operations for:
    - Student data.
    - Professor data.
  - View and manage student and professor lists.
  - Monitor daily attendance data.
  - Analyze user feedback to enhance the system.
  - Authenticate and register new users.
- **Professor Panel**:
  - Conduct roll calls for students.
  - Access daily and cumulative attendance records.
  - Examine trends with dynamic table visualizations.
- **Student Portal**:
  - Log in to view personal attendance records.
  - Access attendance details in an intuitive tabular format.

### 2. Dynamic Attendance Management
- Professors can mark attendance for students daily.
- Updates increment attendance counts even if multiple professors take roll calls for the same student.

### 3. Real-Time Attendance Table
- Daily attendance is displayed in real-time.
- Accurate data visualization for professors and admins.

### 4. Authentication System
- Role-based login for secure access:
  - Admin → Admin Panel.
  - Professor → Attendance Management Dashboard.
  - Student → Attendance View Page.

### 5. Responsive Design
- User-friendly design with responsive CSS for seamless operation on desktops, tablets, and mobile devices.

### 6. Feedback Mechanism
- Users can submit feedback, which the admin reviews to enhance system functionality.

---

## **Technical Stack**
### Frontend:
- **EJS**: Embedded JavaScript templates for dynamic and interactive views.
- **Responsive CSS**: For a clean, modern design.

### Backend:
- **Node.js** and **Express.js**: For robust server-side functionality.
- JavaScript data structures for efficient data management.

### Database:
- **MongoDB**: For storing user profiles, attendance records, and feedback data.

---

## **How to Run the Project**

### Prerequisites
1. Install [Node.js](https://nodejs.org/) and npm.
2. Install MongoDB and ensure it is running locally or use a cloud MongoDB database (e.g., [MongoDB Atlas](https://www.mongodb.com/atlas)).

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/university-attendance-system.git
   cd university-attendance-system

College Resource Hub 🎓

A web-based platform for students to upload, share, and access academic resources like study notes, past papers, and guides. Built with modern web technologies to foster collaborative learning.

🌟 Features
Secure Authentication: JWT-based login with role management
Resource Management: Upload/download study materials with validation
Smart Organization: Categorized by subject and semester
Quality Assurance: Ratings and feedback system
Intelligent Search: Filtered resource discovery
Responsive UI: Works on desktop, tablet, and mobile
Interactive Dashboard: Top resources, downloads, and recommendations

🚀 Tech Stack
Frontend: React.js, HTML5, CSS3, JavaScript (ES6+)
Backend: Flask, MongoDB, RESTful APIs, JWT authentication
Tools: Git, GitHub, Postman, VS Code, MongoDB Compass

🛠 Installation
Clone Repo
git clone https://github.com/anjulchauhan24/sampleMasterAI.git
cd sampleMasterAI
Backend Setup
cd backend
python -m venv venv
# Activate venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
cp .env.example .env  # configure your variables
python app.py


Frontend Setup
cd frontend
npm install
cp .env.example .env.local
npm start


Database
Start MongoDB (mongod) and collections will auto-create.

📂 Project Structure
frontend/       # React app
backend/        # Flask app
database/       # Schemas & seed data
docs/           # Documentation
tests/          # Backend & frontend tests
README.md
PROJECT_REPORT.md

🔧 Environment Variables
Backend (.env): MONGODB_URI, JWT_SECRET_KEY, UPLOAD_FOLDER, etc.
Frontend (.env.local): REACT_APP_API_BASE_URL, allowed file types, max file size

📚 API Endpoints (Highlights)
Auth: /api/auth/register, /api/auth/login, /api/auth/profile
Resources: /api/resources (CRUD), /api/resources/download/:id
Ratings & Reviews: /api/resources/:id/rate, /api/resources/:id/review
Search & Categories: /api/search, /api/categories, /api/subjects

🧪 Testing
# Backend
cd backend
pytest -v

# Frontend
cd frontend
npm test

🚀 Deployment
# Frontend production build
cd frontend
npm run build


Use MongoDB Atlas for production DB
Configure environment variables & CORS
Setup file storage (local/cloud)

🎯 Highlights
High performance & scalability
Secure JWT auth & input validation
Modular, clean, and documented code
Responsive and intuitive UI

🤝 Contributing
Fork repo → git checkout -b feature/Name
Commit → git push origin feature/Name
Open Pull Request

👨‍💻 Author
Anjul Chauhan
Email: anjulchauhan24@gmail.com
GitHub: github.com/anjulchauhan24
LinkedIn: linkedin.com/in/anjulchauhan24


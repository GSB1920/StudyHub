
# StudyHub - Modern EdTech Platform

A React Native application for students to access study materials, test series, and resources.
Built with Expo, React Native Paper, and Supabase.

## Features

- **Authentication**: Secure Login and Signup.
- **Onboarding**: Select Class (8th-12th) and Board (CBSE, ICSE, State).
- **Dashboard**: Personalized subject cards based on profile.
- **Subject Details**: Accordion view for PDFs, Test Series, and Cheat Sheets.
- **Modern UI**: Clean, professional design using React Native Paper.

## Getting Started

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Start the app**:
    ```bash
    npx expo start
    ```

3.  **Run on device/emulator**:
    - Scan QR code with Expo Go app on your phone.
    - Press `a` for Android Emulator.
    - Press `i` for iOS Simulator.

## Backend Setup (Supabase)

This project currently uses a **Mock Service** for rapid development and demonstration.
To connect to a real Supabase backend:

1.  Create a project at [supabase.com](https://supabase.com).
2.  Get your `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
3.  Update `lib/supabase.ts` with your credentials.
4.  Create tables:
    - `profiles` (id, email, class, board)
    - `subjects` (id, name, icon)
    - `materials` (id, subject_id, title, type, url)

## Mock Login Credentials

- **Email**: `student@example.com`
- **Password**: `password`

## Project Structure

- `app/`: Expo Router screens
  - `(auth)`: Login/Signup
  - `(app)`: Dashboard, Onboarding, Subject Details
- `components/`: Reusable UI components
- `context/`: Auth context and state management
- `lib/`: Supabase client and mock services

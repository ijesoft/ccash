from pydantic import BaseModel, EmailStr, Field


class RegisterInput(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    phone: str = Field(min_length=11, max_length=11, pattern=r"^\d{11}$")
    password: str = Field(min_length=8, max_length=128)


class LoginInput(BaseModel):
    email: str
    password: str
    otp_code: str | None = None


class VerifyOtpInput(BaseModel):
    email: str
    code: str = Field(min_length=6, max_length=6)


class Enable2faInput(BaseModel):
    secret: str
    code: str = Field(min_length=6, max_length=6)
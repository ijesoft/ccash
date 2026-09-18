from pydantic import BaseModel, EmailStr, Field


class RegisterInput(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    phone: str = Field(min_length=11, max_length=11, pattern=r"^\d{11}$")
    password: str = Field(min_length=8, max_length=128)
    id_no: str = Field(min_length=9, max_length=9, pattern=r"^\d{9}$")
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


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
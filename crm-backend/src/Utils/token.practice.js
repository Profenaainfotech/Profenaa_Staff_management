// const jwt= require("jsonwebtoken");


// // //methodsor functions()
// // //1. sign - generate signature -> encoded signature
// // //2. decode - extract payload
// // //3. verify (true or false)- validate jwt token -> valid or not




// // // step-1 Encode: Generate jwt token

// const secertKey="sana@2023";
// const Payload="testuser";// decoded token

// // const signedToken = jwt.sign(Payload,secertKey);
// // console.log("Token:",Payload);



// // // //step-2  Validate/ Verify Jwt Token(it gives decoded token)
// const Token="eyJhbGciOiJIUzI1NiJ9.dGVzdHVzZXI.6jENH3mBPM1x_VHonN6vr5lsLSCfjbIn7y7eY0auwQQ";
// const isValid=jwt.verify(Token,secertKey);
// if(isValid){
//     console.log("Token:",isValid);
//     console.log("Permisson granted!....");
// }
// else{
//     console.log("access denied.....");
// }

// // // //step-3 Decode : Payload (information)// it gives decoded payload ()
// const data=jwt.decode(Token,{complete:true});
// console.log("Payload",data.payload);

// // // Bcrypt Js - Hashing data - Sensitive information-> (Password)
const bcrypt=require("bcryptjs")
const User={
    name:"sana.h",
    email:"sana2023@gmail.com",
    password:"sana@2023"
};
// // // Method

// // //1.hash /hashSync
// // //2.compare - verify

// // // step-1 generate hash data : from original data: -> Hashing data(unreadable format of data)

// async function genHashData(data) {
//     const hasedPassword=await bcrypt.hash(data,5);
//     console.log(hasedPassword)
//     return hasedPassword;
    
// }
// genHashData("sana2023@gmail.com");

// step-2 verify password
const hasedPassword="$2b$05$LpobgGcmo937rFLQ/AzP4e3wX.arayzAC29RRtQwRAXNnW8sED6Yq"
async function VerifyPassword() {
    const isvalidPassword= await bcrypt.compare("sana@2023",hasedPassword);
   

    //check
    if(isvalidPassword){
        console.log("invalid credentials");
        return null;

    }
    else{
    console.log("password matched")

    }
    
}
VerifyPassword();